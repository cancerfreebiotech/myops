#!/usr/bin/env node
// =============================================================
// Ragic 採購歷史資料匯入 myOPS
//
//   node scripts/import-ragic/import.mjs --dry-run   驗證模式（只 SELECT，不寫入）
//   node scripts/import-ragic/import.mjs --live      實際匯入
//
// 匯入順序：
//   warehouses → vendors → products → vendor_products → warehouse_stock
//   → rfqs → purchase_requests → pr_items → goods_receipts
//   → inbound_orders(增加+新增) → inbound_items(新批號+無批號)
//   → outbound_orders → outbound_items
//   → deposit_requests → ap_requests → installment_requests
//   → vendor_evaluations → product_evaluations
//   → stock_movements 回填（由盤點三張清單）
//
// 規則：
//   - doc_no 保留 Ragic 原單號（trigger 的 IS NULL 守門不會覆蓋）
//   - 簽核狀態：簽核完成/F→approved、簽核中/P→in_approval、
//     拒絕簽核/REJ→rejected、未簽核/N/空→draft
//   - 歷史單不重建 approval_steps（ApprovalTimeline 空 steps 顯示「尚未送簽」，不會壞）
//   - 人名對不到 users.display_name → fallback admin (pohan.chen@cancerfree.io)
//     並在該筆 notes 加「Ragic原值: XXX」
//   - 出入庫不重算庫存（warehouse_stock 為現況快照）；
//     inbound.stocked_at / outbound.deducted_at 標記原過帳時間（空值以單據日期補）
//   - stock_movements 由盤點清單回填，回填後驗算每商品總和 ≈ warehouse_stock 在庫量
//   - ragic_id_map(doc_type, ragic_no, new_id) 匯入後保留供舊單號查詢
// =============================================================

import fs from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import {
  parseCsv, MAPPINGS, META_COLUMNS, mapStatus,
  toDate, toTs, toNum, toInt, toBool, toFileRef,
} from './parse.mjs'

const DATA_DIR = '/tmp/ragic-analysis/2026-06-11_113326_iso'
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const ADMIN_EMAIL = 'pohan.chen@cancerfree.io'
const DB_HOST = 'aws-1-ap-northeast-1.pooler.supabase.com'
const DB_USER = 'postgres.odzwvkhdrahomgqwlwba'
const DB_PORTS = [5432, 6543]

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const LIVE = args.includes('--live')
if (DRY === LIVE) {
  console.error('Usage: node scripts/import-ragic/import.mjs --dry-run | --live')
  process.exit(2)
}

// ---------- env ----------

function loadEnvLocal() {
  const text = fs.readFileSync(path.join(REPO_ROOT, '.env.local'), 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

// ---------- db connect (auth-failure retry ≤6 rounds, 10s apart, 5432/6543 交替) ----------

async function connect(password) {
  let lastErr
  for (let round = 0; round < 6; round++) {
    const port = DB_PORTS[round % DB_PORTS.length]
    const sql = postgres({
      host: DB_HOST,
      port,
      user: DB_USER,
      password,
      database: 'postgres',
      ssl: 'require',
      prepare: false,
      max: 3,
      connect_timeout: 20,
    })
    try {
      await sql`SELECT 1`
      console.error(`[db] connected via port ${port}`)
      return sql
    } catch (e) {
      lastErr = e
      await sql.end({ timeout: 1 }).catch(() => {})
      console.error(`[db] round ${round + 1}/6 port ${port} failed: ${e.message}`)
      if (round < 5) await new Promise((r) => setTimeout(r, 10_000))
    }
  }
  throw lastErr
}

// ---------- backup.log expected counts ----------

function loadExpectedCounts() {
  const log = fs.readFileSync(path.join(DATA_DIR, 'backup.log'), 'utf8')
  const expected = {}
  for (const m of log.matchAll(/已儲存：(.+?\.csv)（(\d+) 筆資料/g)) {
    expected[m[1]] = Number(m[2])
  }
  return expected
}

// ---------- value conversion ----------

function convert(value, type) {
  switch (type) {
    case 'date': return toDate(value)
    case 'ts': return toTs(value)
    case 'num': return toNum(value)
    case 'int': return toInt(value)
    case 'bool': return toBool(value)
    case 'file': return toFileRef(value)
    default: return value === '' ? null : value
  }
}

// ---------- main ----------

const warnings = []
const warn = (msg) => warnings.push(msg)
const liveLog = [] // 每張表完成後的 SELECT count 驗證紀錄（失敗時也會輸出）

async function main() {
  const env = loadEnvLocal()
  if (!env.SUPABASE_DB_PASSWORD) throw new Error('.env.local missing SUPABASE_DB_PASSWORD')

  const expected = loadExpectedCounts()
  const sql = await connect(env.SUPABASE_DB_PASSWORD)

  try {
    // ── prod users → 人名映射 ──────────────────────────────
    const users = await sql`SELECT id, display_name, email FROM users`
    const admin = users.find((u) => u.email === ADMIN_EMAIL)
    if (!admin) throw new Error(`admin user ${ADMIN_EMAIL} not found in users`)
    const byName = new Map()
    const byEmail = new Map()
    for (const u of users) {
      if (u.display_name) byName.set(u.display_name.trim(), u.id)
      if (u.email) byEmail.set(u.email.trim().toLowerCase(), u.id)
    }
    const userStats = { matched: new Map(), fallback: new Map() }
    function resolveUser(name) {
      const key = (name ?? '').trim()
      if (!key) return { id: null, fallback: false }
      let id = byName.get(key) ?? (key.includes('@') ? byEmail.get(key.toLowerCase()) : undefined)
      if (!id) {
        // 寬鬆比對：display_name 含原名（如 "Po" vs "Po-Han Chen"）
        const hits = users.filter((u) => u.display_name && (
          u.display_name.toLowerCase() === key.toLowerCase() ||
          u.display_name.toLowerCase().includes(key.toLowerCase()) ||
          key.toLowerCase().includes(u.display_name.toLowerCase())
        ))
        if (hits.length === 1) id = hits[0].id
      }
      if (id) {
        userStats.matched.set(key, (userStats.matched.get(key) ?? 0) + 1)
        return { id, fallback: false }
      }
      userStats.fallback.set(key, (userStats.fallback.get(key) ?? 0) + 1)
      return { id: admin.id, fallback: true }
    }

    // ── 驗證目標表存在 ─────────────────────────────────────
    const targetTables = [...new Set(MAPPINGS.map((m) => m.table).filter(Boolean))]
    targetTables.push('stock_movements')
    const found = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY(${targetTables})`
    const foundSet = new Set(found.map((r) => r.table_name))
    const missing = targetTables.filter((t) => !foundSet.has(t))
    if (missing.length) throw new Error(`prod 缺少目標表：${missing.join(', ')}（migration 尚未套用？）`)
    const idMapExists = (await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'ragic_id_map'`).length > 0

    if (LIVE && !idMapExists) {
      await sql`
        CREATE TABLE ragic_id_map (
          doc_type TEXT NOT NULL,
          ragic_no TEXT NOT NULL,
          new_id   UUID NOT NULL,
          PRIMARY KEY (doc_type, ragic_no)
        )`
      await sql`ALTER TABLE ragic_id_map ENABLE ROW LEVEL SECURITY`
    }

    // ── parse all CSVs ─────────────────────────────────────
    const parsed = new Map() // file → rows
    const counts = []
    let allMatch = true
    for (const m of MAPPINGS) {
      const { rows } = parseCsv(fs.readFileSync(path.join(DATA_DIR, m.file), 'utf8'))
      parsed.set(m.file, rows)
      const exp = expected[m.file]
      if (rows.length !== exp) {
        allMatch = false
        warn(`${m.file}: 解析 ${rows.length} 筆 ≠ backup.log ${exp} 筆`)
      }
    }
    for (const f of Object.keys(expected)) {
      if (!parsed.has(f)) { allMatch = false; warn(`backup.log 有 ${f} 但 MAPPINGS 未涵蓋`) }
    }

    // ── transform ──────────────────────────────────────────
    // ragicMap: docType → Map(ragic_no → record)  (dry-run 用記憶體模擬 ragic_id_map)
    const ragicMap = new Map()
    const ensureMap = (t) => { if (!ragicMap.has(t)) ragicMap.set(t, new Map()); return ragicMap.get(t) }
    const masterCode = { vendor: new Map(), product: new Map(), warehouse: new Map() }
    const signatureUploads = [] // {file, localPath, storagePath, table, key}
    const records = new Map() // mapping.file → transformed record list
    const docNoDupes = []
    const orphans = []
    const unknownStatuses = new Map()
    const lineNoSeq = new Map() // parent doc_no → next line_no (items without 項次)
    let stockedAtFallback = 0
    let deductedAtFallback = 0
    let droppedNoteTags = 0

    for (const m of MAPPINGS) {
      if (!m.table) { records.set(m.file, []); continue }
      const rows = parsed.get(m.file)
      const out = []
      const skipSet = new Set([...META_COLUMNS, ...(m.skip ?? [])])
      let mappable = 0

      rows.forEach((row, idx) => {
        const rec = { ...(m.fixed ?? {}) }
        const ragicOriginals = []
        let ok = true

        // doc_no / 主檔 key
        let ragicNo = null
        if (m.docNoFrom) {
          ragicNo = row[m.docNoFrom]?.trim() || null
          rec.doc_no = ragicNo
          if (!ragicNo) { ok = false; warn(`${m.file} 第 ${idx + 2} 行缺單號（${m.docNoFrom}）`) }
        } else if (m.keyFrom) {
          ragicNo = row[m.keyFrom]?.trim() || null
        }

        // status
        if (m.statusFrom) {
          const raw = row[m.statusFrom] ?? ''
          const { status, unknown } = mapStatus(raw)
          rec.status = status
          if (unknown) unknownStatuses.set(`${m.file}:${raw}`, (unknownStatuses.get(`${m.file}:${raw}`) ?? 0) + 1)
        }

        // columns
        for (const [src, spec] of Object.entries(m.columns ?? {})) {
          if (!(src in row)) continue
          const [col, type] = Array.isArray(spec) ? spec : [spec, 'text']
          if (type === 'user') {
            const { id, fallback } = resolveUser(row[src])
            rec[col] = id
            if (fallback) ragicOriginals.push(`${src}=${row[src].trim()}`)
          } else if (type === 'unitBoth') {
            const v = row[src] === '' ? null : row[src]
            rec.purchase_unit = v
            rec.stock_unit = v
          } else if (type === 'file' && /_images[\\/]/.test(row[src] ?? '')) {
            // 簽章圖：dump 內有實體檔 → 上傳 procurement bucket 後記路徑
            const rel = row[src].replace(/\\/g, '/')
            const storagePath = `ragic/${rel}`
            rec[col] = storagePath
            signatureUploads.push({
              file: m.file, table: m.table, key: ragicNo,
              localPath: path.join(DATA_DIR, rel), storagePath, col,
            })
          } else {
            rec[col] = convert(row[src], type)
          }
        }

        // 未列入 mapping 也不在 skip 名單的欄位 → 提醒
        for (const h of Object.keys(row)) {
          if (!skipSet.has(h) && !(h in (m.columns ?? {})) &&
              h !== m.docNoFrom && h !== m.statusFrom && h !== m.keyFrom &&
              !(m.refs ?? []).some((r) => r.from === h) &&
              m.parentRef?.from !== h &&
              !(m.codeRefs ?? []).some((r) => r.from === h)) {
            if (idx === 0) warn(`${m.file}: 欄位「${h}」未映射也未列 skip`)
          }
        }

        // cross-doc refs (ragic_id_map)
        for (const r of [...(m.refs ?? []), ...(m.parentRef ? [m.parentRef] : [])]) {
          const refNo = row[r.from]?.trim()
          if (!refNo) {
            rec[r.col] = null
            if (r.required) { ok = false; orphans.push(`${m.file} 第 ${idx + 2} 行：${r.from} 為空（必填父單）`) }
            continue
          }
          const target = ensureMap(r.docType).get(refNo)
          if (!target) {
            rec[r.col] = null
            orphans.push(`${m.file} 第 ${idx + 2} 行：${r.from}=${refNo} 在 ${r.docType} 找不到`)
            if (r.required) ok = false
          } else {
            rec[r.col] = { $ref: r.docType, no: refNo } // live 時換成實際 id
          }
        }

        // master-code refs
        for (const r of m.codeRefs ?? []) {
          const code = row[r.from]?.trim()
          if (!code) { rec[r.col] = null; if (r.required) { ok = false; orphans.push(`${m.file} 第 ${idx + 2} 行：${r.from} 為空`) } continue }
          if (!masterCode[r.master].has(code)) {
            rec[r.col] = null
            orphans.push(`${m.file} 第 ${idx + 2} 行：${r.from}=${code} 在 ${r.master} 主檔找不到`)
            if (r.required) ok = false
          } else {
            rec[r.col] = { $master: r.master, code }
          }
        }

        // 新批號入庫清單：重建 stock_code = 倉庫代碼-商品編號-批號
        if (m.stockCodeBuild) {
          const parts = m.stockCodeBuild.map((c) => row[c]?.trim() ?? '')
          rec.stock_code = parts.every(Boolean) ? parts.join('-') : null
        }

        // 數量空值 → 0（NOT NULL 欄；如 IN-O-20241030-001 的 P00010/P00011）
        if (m.table === 'inbound_items' && rec.quantity == null) {
          rec.quantity = 0
          rec.notes = rec.notes ? `${rec.notes}\nRagic原值: 數量為空` : 'Ragic原值: 數量為空'
        }
        if (m.table === 'outbound_items' && rec.used_qty == null) {
          rec.used_qty = 0
          rec.notes = rec.notes ? `${rec.notes}\nRagic原值: 使用數量為空` : 'Ragic原值: 使用數量為空'
        }

        // items 無項次 → 依父單給序號
        if ((m.table === 'inbound_items' || m.table === 'outbound_items') && rec.line_no == null) {
          const parentNo = row[m.parentRef.from]?.trim() ?? '?'
          const k = `${m.table}:${parentNo}`
          const n = (lineNoSeq.get(k) ?? 0) + 1
          lineNoSeq.set(k, n)
          rec.line_no = n
        }

        // posted 標記：stocked_at / deducted_at 空值以單據日期補（避免之後誤過帳）
        if (m.table === 'inbound_orders' && !rec.stocked_at && rec.order_date) {
          rec.stocked_at = `${rec.order_date}T00:00:00+08:00`
          stockedAtFallback++
        }
        if (m.table === 'outbound_orders' && !rec.deducted_at && rec.order_date) {
          rec.deducted_at = `${rec.order_date}T00:00:00+08:00`
          deductedAtFallback++
        }

        // 人名 fallback 記錄到 notes
        // （products 無 notes 欄 → 寫 description；warehouse_stock 無任何
        //   自由文字欄 → 無法保留原名，僅計數警告）
        if (ragicOriginals.length) {
          const tag = `Ragic原值: ${ragicOriginals.join('、')}`
          const noteCol = m.table === 'products' ? 'description'
            : m.table === 'warehouse_stock' ? null
            : 'notes'
          if (noteCol) rec[noteCol] = rec[noteCol] ? `${rec[noteCol]}\n${tag}` : tag
          else droppedNoteTags++
        }

        // 單號唯一性 / 主檔 key 登錄
        if (ragicNo && m.docType) {
          const map = ensureMap(m.docType)
          if (map.has(ragicNo)) {
            docNoDupes.push(`${m.docType} ${ragicNo}（${m.file} 第 ${idx + 2} 行重複）`)
            ok = false
          } else {
            map.set(ragicNo, rec)
          }
        }
        if (m.table === 'vendors') masterCode.vendor.set(rec.vendor_code, rec)
        if (m.table === 'products') masterCode.product.set(rec.product_code, rec)
        if (m.table === 'warehouses') masterCode.warehouse.set(rec.code, rec)
        if (m.table === 'warehouse_stock' && rec.stock_code) ensureMap('warehouse_stock').set(rec.stock_code, rec)

        if (ok) mappable++
        out.push({ rec, ok, row })
      })

      records.set(m.file, out)
      m._mappable = mappable
    }

    // ── stock_movements 回填計畫（由盤點三張清單）────────────
    const movements = []
    const inboundOrders = ensureMap('inbound_order')
    const outboundOrders = ensureMap('outbound_order')
    for (const file of ['盤點_新批號入庫清單.csv', '盤點_無批號入庫清單.csv']) {
      for (const { rec, row } of records.get(file)) {
        const parent = inboundOrders.get(row['入庫單號']?.trim())
        const when = parent?.stocked_at ?? toTs(row['入庫存日期時間']) ?? null
        movements.push({
          product_code: rec.product_code, stock_code: rec.stock_code,
          delta_qty: rec.quantity ?? 0, movement_type: 'inbound',
          doc_type: 'inbound_order', doc_no: row['入庫單號']?.trim() ?? null,
          created_at: when,
        })
      }
    }
    for (const { rec, row } of records.get('盤點_出庫清單.csv')) {
      const parent = outboundOrders.get(row['出庫單號']?.trim())
      movements.push({
        product_code: rec.product_code, stock_code: rec.stock_code,
        delta_qty: -(rec.used_qty ?? 0), movement_type: 'outbound',
        doc_type: 'outbound_order', doc_no: row['出庫單號']?.trim() ?? null,
        created_at: parent?.deducted_at ?? null,
      })
    }

    // 驗算：每商品 movements 總和 vs warehouse_stock 在庫量
    const ledgerSum = new Map()
    for (const mv of movements) {
      ledgerSum.set(mv.product_code, (ledgerSum.get(mv.product_code) ?? 0) + mv.delta_qty)
    }
    const stockSum = new Map()
    for (const { rec } of records.get('庫存_倉庫庫存.csv')) {
      stockSum.set(rec.product_code, (stockSum.get(rec.product_code) ?? 0) + (rec.quantity ?? 0))
    }
    const ledgerMismatches = []
    for (const code of new Set([...ledgerSum.keys(), ...stockSum.keys()])) {
      const l = ledgerSum.get(code) ?? 0
      const s = stockSum.get(code) ?? 0
      if (Math.abs(l - s) > 1e-9) ledgerMismatches.push({ code, ledger: l, stock: s, diff: s - l })
    }

    // ── 集計 warnings ──────────────────────────────────────
    if (docNoDupes.length) warn(`單號重複 ${docNoDupes.length} 筆：${docNoDupes.slice(0, 10).join('；')}${docNoDupes.length > 10 ? ' …' : ''}`)
    if (orphans.length) {
      warn(`孤兒 FK ${orphans.length} 筆：${orphans.slice(0, 12).join('；')}${orphans.length > 12 ? ` …(其餘 ${orphans.length - 12} 筆)` : ''}`)
    }
    for (const [k, n] of unknownStatuses) warn(`未知簽核狀態 ${k} × ${n}（暫映射 draft）`)
    if (droppedNoteTags) warn(`warehouse_stock 無 notes 欄：${droppedNoteTags} 筆人名 fallback 原值無法保留（建檔/修改人員原名遺失，僅 created_by/updated_by 掛 admin）`)
    if (ledgerMismatches.length) {
      const top = ledgerMismatches.slice(0, 12)
        .map((x) => `${x.code}: movements=${x.ledger} vs 在庫=${x.stock}（差 ${x.diff}）`)
      warn(`ledger 驗算不一致 ${ledgerMismatches.length} 個商品（舊系統盤差可能）：${top.join('；')}${ledgerMismatches.length > 12 ? ' …' : ''}`)
    }

    // ── 報表 ───────────────────────────────────────────────
    const countLines = MAPPINGS.map((m) => {
      const n = parsed.get(m.file).length
      const exp = expected[m.file]
      const mark = n === exp ? 'OK' : 'MISMATCH'
      if (!m.table) return `${m.file}: ${n}/${exp} ${mark} → (跳過：${m.skipReason})`
      return `${m.file}: ${n}/${exp} ${mark} → ${m.table}，可映射 ${m._mappable}`
    })

    const fallbackTotal = [...userStats.fallback.values()].reduce((a, b) => a + b, 0)
    const matchedTotal = [...userStats.matched.values()].reduce((a, b) => a + b, 0)
    const userReport = {
      prodUsers: users.length,
      matchedNames: Object.fromEntries(userStats.matched),
      fallbackNames: Object.fromEntries(userStats.fallback),
      matchedTotal,
      fallbackTotal,
      adminFallbackId: admin.id,
    }

    const report = {
      mode: DRY ? 'dry-run' : 'live',
      allCountsMatch: allMatch,
      counts: countLines,
      userMapping: userReport,
      movementsPlanned: movements.length,
      ledgerMismatchProducts: ledgerMismatches.length,
      signatureUploads: signatureUploads.map((s) => `${s.localPath} → procurement/${s.storagePath}`),
      stockedAtFallback,
      deductedAtFallback,
      ragicIdMapExists: idMapExists,
      warnings,
      liveLog,
    }

    // ── live 寫入 ──────────────────────────────────────────
    if (LIVE) {
      await liveImport(sql, records, movements, signatureUploads, masterCode, ragicMap, env)
    }

    console.log(JSON.stringify(report, null, 2))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

// ---------- live import ----------

async function liveImport(sql, records, movements, signatureUploads, masterCode, ragicMap, env) {
  const idOf = new Map() // `${docType}:${no}` → uuid, `${master}:${code}` → uuid
  const resolveVal = (v) => {
    if (v && typeof v === 'object') {
      if (v.$ref) return idOf.get(`${v.$ref}:${v.no}`) ?? null
      if (v.$master) return idOf.get(`m:${v.$master}:${v.code}`) ?? null
    }
    return v
  }

  const tableCount = async (t) =>
    Number((await sql`SELECT count(*)::int AS n FROM ${sql(t)}`)[0].n)

  // ── resume 預載：已存在的主檔 code / ragic_id_map → 跳過重複列 ──
  for (const r of await sql`SELECT id, vendor_code FROM vendors`) idOf.set(`m:vendor:${r.vendor_code}`, r.id)
  for (const r of await sql`SELECT id, product_code FROM products`) idOf.set(`m:product:${r.product_code}`, r.id)
  for (const r of await sql`SELECT id, code FROM warehouses`) idOf.set(`m:warehouse:${r.code}`, r.id)
  for (const r of await sql`SELECT id, stock_code FROM warehouse_stock WHERE stock_code IS NOT NULL`) idOf.set(`stock:${r.stock_code}`, r.id)
  for (const r of await sql`SELECT doc_type, ragic_no, new_id FROM ragic_id_map`) idOf.set(`${r.doc_type}:${r.ragic_no}`, r.new_id)

  // 無 per-row key 的表（vendor_products / pr_items / inbound_items / outbound_items）：
  // 插入順序確定性 → 以「既有筆數」做前綴跳過（跨檔累計）
  const prefixSkip = new Map()
  for (const t of ['vendor_products', 'pr_items', 'inbound_items', 'outbound_items']) {
    prefixSkip.set(t, await tableCount(t))
  }

  for (const m of MAPPINGS) {
    if (!m.table) continue
    const list = records.get(m.file)
    const okRows = list.filter((x) => x.ok).length
    const before = await tableCount(m.table)
    let inserted = 0
    let skippedExisting = 0
    let failure = null
    for (const { rec, ok } of list) {
      if (!ok) continue
      let skipKey = null
      if (m.table === 'vendors') skipKey = `m:vendor:${rec.vendor_code}`
      else if (m.table === 'warehouses') skipKey = `m:warehouse:${rec.code}`
      else if (m.table === 'products') skipKey = `m:product:${rec.product_code}`
      else if (m.table === 'warehouse_stock' && rec.stock_code) skipKey = `stock:${rec.stock_code}`
      else if (m.docType && rec.doc_no) skipKey = `${m.docType}:${rec.doc_no}`
      if (skipKey && idOf.has(skipKey)) { skippedExisting++; continue }
      if (!skipKey && prefixSkip.has(m.table) && prefixSkip.get(m.table) > 0) {
        prefixSkip.set(m.table, prefixSkip.get(m.table) - 1)
        skippedExisting++
        continue
      }
      const data = {}
      for (const [k, v] of Object.entries(rec)) data[k] = resolveVal(v)
      try {
        const [r] = await sql`INSERT INTO ${sql(m.table)} ${sql(data)} RETURNING id`
        inserted++
        // 主檔（keyFrom 表）也記入 ragic_id_map：vendor/product 用編號、warehouse 用代碼
        const no = data.doc_no
          ?? (m.table === 'vendors' ? data.vendor_code : null)
          ?? (m.table === 'products' ? data.product_code : null)
          ?? (m.table === 'warehouses' ? data.code : null)
          ?? rec.stock_code ?? null
        if (m.docType && no) {
          idOf.set(`${m.docType}:${no}`, r.id)
          await sql`
            INSERT INTO ragic_id_map (doc_type, ragic_no, new_id)
            VALUES (${m.docType}, ${no}, ${r.id})
            ON CONFLICT (doc_type, ragic_no) DO NOTHING`
        }
        if (m.table === 'vendors') idOf.set(`m:vendor:${data.vendor_code}`, r.id)
        if (m.table === 'products') idOf.set(`m:product:${data.product_code}`, r.id)
        if (m.table === 'warehouses') idOf.set(`m:warehouse:${data.code}`, r.id)
        if (m.table === 'warehouse_stock' && data.stock_code) idOf.set(`stock:${data.stock_code}`, r.id)
      } catch (e) {
        // 任何一張表失敗 → 停止後續（不 rollback 已成功部分），精確回報狀態
        failure = `${m.file} → ${m.table} 第 ${inserted + 1} 筆 insert 失敗（doc_no/key=${data.doc_no ?? rec.stock_code ?? '?'}）：${e.message}`
        break
      }
    }
    const after = await tableCount(m.table)
    const line = `[verify] ${m.table} ← ${m.file}: inserted ${inserted}/${okRows}（檔內 ${list.length} 行${skippedExisting ? `，resume 跳過已存在 ${skippedExisting}` : ''}）｜SELECT count = ${after}（匯入前 ${before}，Δ ${after - before}）`
    liveLog.push(line)
    console.error(line)
    if (failure) {
      const err = new Error(failure)
      err.liveLog = liveLog
      throw err
    }
  }

  // inbound/outbound items 的 warehouse_stock_id 補連
  await sql`
    UPDATE inbound_items i SET warehouse_stock_id = ws.id
    FROM warehouse_stock ws
    WHERE i.warehouse_stock_id IS NULL AND i.stock_code IS NOT NULL AND ws.stock_code = i.stock_code`
  await sql`
    UPDATE outbound_items o SET warehouse_stock_id = ws.id
    FROM warehouse_stock ws
    WHERE o.warehouse_stock_id IS NULL AND o.stock_code IS NOT NULL AND ws.stock_code = o.stock_code`

  // stock_movements 回填（resume：回填順序確定性，跳過已存在的前綴筆數）
  const mvBefore = await tableCount('stock_movements')
  const mvExisting = Number((await sql`
    SELECT count(*)::int AS n FROM stock_movements WHERE note LIKE 'Ragic 歷史回填%'`)[0].n)
  let mvSeen = 0
  let mvInserted = 0
  for (const mv of movements) {
    if (mvSeen++ < mvExisting) continue
    const productId = idOf.get(`m:product:${mv.product_code}`)
    if (!productId) { warnings.push(`[live] movement 略過：商品 ${mv.product_code} 無 id`); continue }
    const docId = idOf.get(`${mv.doc_type}:${mv.doc_no}`) ?? null
    const wsId = mv.stock_code ? idOf.get(`stock:${mv.stock_code}`) ?? null : null
    try {
      await sql`
        INSERT INTO stock_movements ${sql({
          product_id: productId,
          warehouse_stock_id: wsId,
          delta_qty: mv.delta_qty,
          movement_type: mv.movement_type,
          doc_type: mv.doc_type,
          doc_id: docId,
          note: `Ragic 歷史回填 (${mv.doc_no ?? '-'})`,
          created_at: mv.created_at ?? new Date().toISOString(),
        })}`
      mvInserted++
    } catch (e) {
      const mvAfter = await tableCount('stock_movements')
      liveLog.push(`[verify] stock_movements 回填中斷：inserted ${mvInserted}/${movements.length}｜SELECT count = ${mvAfter}（匯入前 ${mvBefore}）`)
      const err = new Error(`stock_movements 第 ${mvInserted + 1} 筆 insert 失敗（${mv.doc_no ?? '-'}）：${e.message}`)
      err.liveLog = liveLog
      throw err
    }
  }
  const mvAfter = await tableCount('stock_movements')
  const mvLine = `[verify] stock_movements 回填: inserted ${mvInserted}/${movements.length}｜SELECT count = ${mvAfter}（匯入前 ${mvBefore}，Δ ${mvAfter - mvBefore}）`
  liveLog.push(mvLine)
  console.error(mvLine)

  // 簽章 PNG 上傳 procurement bucket
  for (const s of signatureUploads) {
    const buf = fs.readFileSync(s.localPath)
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/procurement/${encodeURIComponent(s.storagePath)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: buf,
    })
    if (!res.ok) warnings.push(`[live] 簽章上傳失敗 ${s.storagePath}: ${res.status} ${await res.text()}`)
    else {
      liveLog.push(`[upload] 簽章 ${s.localPath} → procurement/${s.storagePath}（${s.table}.${s.col}, key=${s.key}）`)
      console.error(`[live] 簽章上傳 ${s.storagePath}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  // 失敗時也輸出已完成部分的精確狀態（不 rollback）
  console.log(JSON.stringify({
    mode: LIVE ? 'live' : 'dry-run',
    failed: true,
    error: e.message,
    liveLog: e.liveLog ?? liveLog,
    warnings,
  }, null, 2))
  process.exit(1)
})
