// =============================================================
// Ragic CSV parsing + 中文欄名 → myOPS 欄名 mapping tables
//
// Source dump: /tmp/ragic-analysis/2026-06-11_113326_iso/
// Target schema: supabase/migrations/20260612000009 / 000010
//
// Ragic meta columns are intentionally NOT mapped anywhere:
//   wfId, 下一位簽核人, 公司群組, 機密等級, 權限群組,
//   相關人, 相關群組, 相關部門, 單號預覽, LOCKED, 簽核(used only
//   as status source on sheets that lack 簽核狀態).
// =============================================================

// ---------- CSV parser (BOM, quoted fields, embedded commas/newlines, CRLF) ----------

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rawRows = []
  let field = ''
  let row = []
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); field = ''; rawRows.push(row); row = [] }
    else if (c === '\r') { /* swallow */ }
    else field += c
  }
  if (field !== '' || row.length) { row.push(field); rawRows.push(row) }
  const headers = rawRows.shift().map((h) => h.trim())
  const rows = rawRows
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])))
  return { headers, rows }
}

// ---------- value converters ----------

const empty = (v) => v === undefined || v === null || String(v).trim() === ''

export function toDate(v) {
  if (empty(v)) return null
  const m = String(v).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

// Ragic exports are Asia/Taipei wall-clock times.
export function toTs(v) {
  if (empty(v)) return null
  const m = String(v).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${s.padStart(2, '0')}+08:00`
}

export function toNum(v) {
  if (empty(v)) return null
  const n = Number(String(v).replace(/,/g, '').replace(/%$/, ''))
  return Number.isFinite(n) ? n : null
}

export function toInt(v) {
  const n = toNum(v)
  return n === null ? null : Math.trunc(n)
}

export function toBool(v) {
  if (empty(v)) return null
  const s = String(v).trim().toLowerCase()
  if (['yes', 'y', 'true', '是'].includes(s)) return true
  if (['no', 'n', 'false', '否'].includes(s)) return false
  return null
}

// Ragic file-reference fields look like "Bj4dKmipUT@原始檔名.jpg".
// The actual binaries are not part of the dump (only 2 signature PNGs),
// so we keep the original reference, namespaced for later retrieval.
export function toFileRef(v) {
  if (empty(v)) return null
  return `ragic://${v}`
}

// ---------- 簽核狀態 mapping ----------
// Observed values across the dump:
//   簽核完成 / F      → approved
//   簽核中   / P      → in_approval
//   拒絕簽核 / REJ    → rejected
//   未簽核   / N / '' → draft

export const STATUS_MAP = {
  簽核完成: 'approved',
  F: 'approved',
  簽核中: 'in_approval',
  P: 'in_approval',
  拒絕簽核: 'rejected',
  REJ: 'rejected',
  未簽核: 'draft',
  N: 'draft',
  '': 'draft',
}

export function mapStatus(v) {
  const key = (v ?? '').trim()
  if (key in STATUS_MAP) return { status: STATUS_MAP[key], unknown: false }
  return { status: 'draft', unknown: true }
}

// ---------- Ragic meta columns (never mapped) ----------

export const META_COLUMNS = [
  'wfId', '下一位簽核人', '公司群組', '機密等級', '權限群組',
  '相關人', '相關群組', '相關部門', '單號預覽', 'LOCKED', '簽核',
]

// ---------- field type tags ----------
// plain string value  → TEXT column
// [col, 'date'|'ts'|'num'|'int'|'bool'|'file'|'user'] → converted

// ---------- per-CSV mappings, in import order ----------
// Each mapping:
//   file       CSV 檔名
//   table      target table (null → intentionally skipped CSV)
//   docNoFrom  CSV column holding the Ragic document number → doc_no
//   docType    key used in ragic_id_map
//   statusFrom CSV column for approval status (簽核狀態 preferred, 簽核 code fallback)
//   columns    中文欄名 → target column spec
//   refs       cross-document references resolved through ragic_id_map
//   codeRefs   master-code references (vendor_code/product_code/warehouse code)
//   fixed      constant column values
//   skip       columns intentionally dropped beyond META_COLUMNS

export const MAPPINGS = [
  // ── 1. masters ─────────────────────────────────────────────
  {
    file: '庫存_倉庫管理.csv',
    table: 'warehouses',
    docType: 'warehouse',
    keyFrom: '倉庫代碼',
    columns: {
      倉庫代碼: 'code',
      倉庫名稱: 'name',
      倉庫地址: 'address',
      聯絡人: 'contact_person',
      電話: 'phone',
      備註: 'notes',
      建檔人員: ['created_by', 'user'],
      建檔日期時間: ['created_at', 'ts'],
      最後修改人員: ['updated_by', 'user'],
      最後修改日期時間: ['updated_at', 'ts'],
    },
  },
  {
    file: '採購_廠商清冊.csv',
    table: 'vendors',
    docType: 'vendor',
    keyFrom: '廠商編號',
    columns: {
      廠商編號: 'vendor_code',
      名稱: 'name',
      簡稱: 'short_name',
      廠商類別: 'vendor_category',
      國別: 'country',
      統一編號: 'tax_id',
      電話號碼: 'phone',
      傳真號碼: 'fax',
      聯絡窗口: 'contact_person',
      窗口電話: 'contact_phone',
      窗口手機: 'contact_mobile',
      '窗口E-mail': 'contact_email',
      會計聯絡人: 'accounting_contact',
      會計電話: 'accounting_phone',
      會計手機: 'accounting_mobile',
      '會計E-mail': 'accounting_email',
      帳單郵遞區號: 'billing_postal_code',
      帳單縣市及鄉鎮市區: 'billing_city_district',
      街道地址: 'street_address',
      完整帳單地址: 'full_billing_address',
      付款方式: 'payment_method',
      付款條件: 'payment_terms',
      結帳日: 'closing_day',
      國貿條規: 'incoterms',
      銀行名稱: 'bank_name',
      分行名稱: 'bank_branch',
      銀行通匯代號: 'bank_swift_code',
      帳號: 'bank_account_no',
      戶名: 'bank_account_name',
      匯款帳號存摺影本: ['bankbook_copy_url', 'file'],
      公司發票印章: ['invoice_seal_url', 'file'],
      實收資本額: 'paid_in_capital',
      去年營收: 'last_year_revenue',
      填表人: ['filled_by_id', 'user'],
      填表人簽章: ['filler_signature_url', 'file'],
      填表部門: 'filling_department',
      備註: 'notes',
    },
  },
  {
    file: '採購_商品清冊.csv',
    table: 'products',
    docType: 'product',
    keyFrom: '商品編號',
    // 雙單位制是新制——Ragic 舊資料採購/庫存單位一致，換算率 1。
    fixed: { units_per_purchase: 1 },
    columns: {
      商品編號: 'product_code',
      商品名稱: 'name',
      規格: 'spec',
      分類: 'category',
      種類: 'product_type',
      廠牌: 'brand',
      主要來源: 'primary_source',
      貨號: 'item_code',
      圖片: ['image_url', 'file'],
      敘述: 'description',
      預設部門: 'default_department',
      單位: ['purchase_unit', 'unitBoth'], // → purchase_unit + stock_unit
      目前庫存數量: ['current_stock_qty', 'num'],
      建檔人員: ['created_by', 'user'],
      建檔日期時間: ['created_at', 'ts'],
      最後修改人員: ['updated_by', 'user'],
      最後修改日期時間: ['updated_at', 'ts'],
    },
  },
  {
    file: '採購_商品廠商價格.csv',
    table: 'vendor_products',
    docType: 'vendor_product',
    codeRefs: [
      { from: '商品編號', master: 'product', col: 'product_id' },
      { from: '廠商編號', master: 'vendor', col: 'vendor_id' },
    ],
    columns: {
      商品編號: 'product_code',
      商品名稱: 'product_name',
      規格: 'spec',
      種類: 'product_type',
      單位: 'unit',
      廠商編號: 'vendor_code',
      廠商名稱: 'vendor_name',
      聯絡人: 'contact_person',
      採購編號: 'purchase_code',
      '商品價格(未稅)': ['unit_price', 'num'],
      報價日期: ['quote_date', 'date'],
      填單日期: ['filled_date', 'date'],
      來源詢價單: 'source_rfq_no',
      建立日期: ['created_at', 'ts'],
    },
  },
  {
    file: '庫存_倉庫庫存.csv',
    table: 'warehouse_stock',
    docType: 'warehouse_stock',
    keyFrom: '庫存編號',
    codeRefs: [
      { from: '倉庫代碼', master: 'warehouse', col: 'warehouse_id', required: true },
      { from: '商品編號', master: 'product', col: 'product_id', required: true },
    ],
    skip: ['倉庫名稱', '預設部門'],
    columns: {
      庫存編號: 'stock_code',
      批號: 'lot_no',
      效期: ['expiry_date', 'date'],
      數量: ['quantity', 'num'],
      商品編號: 'product_code',
      商品名稱: 'product_name',
      規格: 'spec',
      種類: 'product_type',
      單位: 'unit',
      建檔人員: ['created_by', 'user'],
      建檔日期時間: ['created_at', 'ts'],
      最後修改人員: ['updated_by', 'user'],
      最後修改日期時間: ['updated_at', 'ts'],
    },
  },

  // ── 2. document chain ──────────────────────────────────────
  {
    file: '採購_詢價單.csv',
    table: 'rfqs',
    docType: 'rfq',
    docNoFrom: '詢價單號',
    statusFrom: '簽核狀態',
    columns: {
      請購日期: ['request_date', 'date'],
      請購部門: 'requesting_department',
      部門: 'department',
      請購人員: ['requester_id', 'user'],
      請購備註: 'request_notes',
      詢價人員: ['inquirer_id', 'user'],
      覆核人員: ['reviewer_id', 'user'],
      覆核日期: ['review_date', 'date'],
      覆核備註: 'review_notes',
      緊急程度: 'urgency',
      期望到貨日: ['expected_delivery_date', 'date'],
      請採購單數量: ['pr_count', 'int'],
      商品評估單數量: ['product_eval_count', 'int'],
    },
  },
  {
    file: '採購_請採購單.csv',
    table: 'purchase_requests',
    docType: 'purchase_request',
    docNoFrom: '採購單號',
    statusFrom: '簽核', // 此表單無「簽核狀態」欄，使用 F/P/N 代碼欄
    refs: [{ from: '來自詢價單號', docType: 'rfq', col: 'rfq_id' }],
    codeRefs: [{ from: '廠商編號', master: 'vendor', col: 'vendor_id' }],
    columns: {
      採購人員: ['purchaser_id', 'user'],
      採購日期: ['purchase_date', 'date'],
      請購部門: 'requesting_department',
      緊急程度: 'urgency',
      狀態: 'fulfillment_status',
      廠商編號: 'vendor_code',
      廠商名稱: 'vendor_name',
      統一編號: 'tax_id',
      聯絡人: 'contact_person',
      電話: 'phone',
      傳真: 'fax',
      電子郵件信箱: 'email',
      地址: 'address',
      交貨地址: 'delivery_address',
      付款方式: 'payment_method',
      付款條件: 'payment_terms',
      國貿條規: 'incoterms',
      課稅別: 'tax_type',
      稅率: ['tax_rate', 'num'],
      稅額: ['tax_amount', 'num'],
      小計: ['subtotal', 'num'],
      運費: ['shipping_fee', 'num'],
      合計金額: ['total_amount', 'num'],
      請購期望日: ['request_expected_date', 'date'],
      要求到貨日: ['required_delivery_date', 'date'],
      預計到貨日: ['expected_delivery_date', 'date'],
      結案日期: ['closed_date', 'date'],
      進貨單數量: ['gr_count', 'int'],
      訂金請款單數量: ['deposit_request_count', 'int'],
      備註: 'notes',
      建檔人員: ['created_by', 'user'],
      建檔日期時間: ['created_at', 'ts'],
      最後修改人員: ['updated_by', 'user'],
      最後修改日期時間: ['updated_at', 'ts'],
    },
  },
  {
    file: '採購_採購細項.csv',
    table: 'pr_items',
    docType: 'pr_item',
    parentRef: { from: '採購單號', docType: 'purchase_request', col: 'pr_id', required: true },
    codeRefs: [{ from: '商品編號*', master: 'product', col: 'product_id' }],
    columns: {
      項次: ['line_no', 'int'],
      '商品編號*': 'product_code',
      商品名稱: 'product_name',
      規格: 'spec',
      '單位*': 'unit',
      商品採購編號: 'purchase_code',
      單價: ['unit_price', 'num'],
      數量: ['quantity', 'num'],
      金額: ['amount', 'num'],
      已進貨數量: ['received_qty', 'num'],
      尚未進貨數量: ['pending_qty', 'num'],
    },
  },
  {
    file: '採購_進貨驗收單.csv',
    table: 'goods_receipts',
    docType: 'goods_receipt',
    docNoFrom: '進貨單號',
    statusFrom: '簽核',
    refs: [{ from: '來自採購單號', docType: 'purchase_request', col: 'pr_id' }],
    codeRefs: [{ from: '廠商編號', master: 'vendor', col: 'vendor_id' }],
    columns: {
      進貨人員: ['receiver_id', 'user'],
      請購部門: 'requesting_department',
      廠商編號: 'vendor_code',
      廠商名稱: 'vendor_name',
      統一編號: 'tax_id',
      聯絡人: 'contact_person',
      電話: 'phone',
      傳真: 'fax',
      電子郵件信箱: 'email',
      課稅別: 'tax_type',
      稅率: ['tax_rate', 'num'],
      稅額: ['tax_amount', 'num'],
      小計: ['subtotal', 'num'],
      運費: ['shipping_fee', 'num'],
      合計金額: ['total_amount', 'num'],
      是否已付訂金: ['has_deposit', 'bool'],
      已付訂金單號: 'deposit_doc_no',
      已付訂金: ['deposit_paid_amount', 'num'],
      發票號碼: 'invoice_no',
      發票日期: ['invoice_date', 'date'],
      發票單據: ['invoice_doc_url', 'file'],
      出貨單據: ['shipping_doc_url', 'file'],
      進貨時間: ['received_at', 'ts'],
      驗收時間: ['inspected_at', 'ts'],
      確認入庫時間: ['confirmed_inbound_at', 'ts'],
      '已轉驗收?': ['converted_to_inspection', 'bool'],
      備註: 'notes',
      建檔人員: ['created_by', 'user'],
      建檔日期時間: ['created_at', 'ts'],
      最後修改人員: ['updated_by', 'user'],
      最後修改日期時間: ['updated_at', 'ts'],
    },
  },
  {
    file: '庫存_入庫單(增加).csv',
    table: 'inbound_orders',
    docType: 'inbound_order',
    docNoFrom: '入庫單號',
    statusFrom: '簽核',
    fixed: { is_new_lot: false },
    refs: [{ from: '進貨驗收編號', docType: 'goods_receipt', col: 'gr_id' }],
    columns: {
      日期: ['order_date', 'date'],
      入庫存日期時間: ['stocked_at', 'ts'],
      單據備註: 'notes',
      建檔人員: ['created_by', 'user'],
      最後修改人員: ['updated_by', 'user'],
      最後修改日期時間: ['updated_at', 'ts'],
    },
  },
  {
    file: '庫存_入庫單(新增).csv',
    table: 'inbound_orders',
    docType: 'inbound_order',
    docNoFrom: '入庫單號',
    statusFrom: '簽核',
    fixed: { is_new_lot: true },
    refs: [{ from: '進貨驗收編號', docType: 'goods_receipt', col: 'gr_id' }],
    columns: {
      日期: ['order_date', 'date'],
      入庫存日期時間: ['stocked_at', 'ts'],
      入庫存狀態: 'inbound_status',
      單據備註: 'notes',
      建檔人員: ['created_by', 'user'],
      最後修改人員: ['updated_by', 'user'],
      最後修改日期時間: ['updated_at', 'ts'],
    },
  },
  {
    file: '盤點_新批號入庫清單.csv',
    table: 'inbound_items',
    docType: 'inbound_item_new',
    parentRef: { from: '入庫單號', docType: 'inbound_order', col: 'inbound_order_id', required: true },
    codeRefs: [
      { from: '商品編號', master: 'product', col: 'product_id' },
      { from: '倉庫代碼', master: 'warehouse', col: 'warehouse_id' },
    ],
    // 庫存編號(預覽) 是壞掉的 Ragic 預覽值（"-P00233-"）——
    // 實際 stock_code 由 倉庫代碼-商品編號-批號 重建後對 warehouse_stock。
    skip: ['庫存編號(預覽)', '倉庫名稱', '入庫年', '入庫月', '入庫日', '入庫存狀態', '入庫存日期時間'],
    stockCodeBuild: ['倉庫代碼', '商品編號', '批號'],
    columns: {
      商品編號: 'product_code',
      商品名稱: 'product_name',
      規格: 'spec',
      單位: 'unit',
      批號: 'lot_no',
      數量: ['quantity', 'num'],
      備註: 'notes',
    },
  },
  {
    file: '盤點_無批號入庫清單.csv',
    table: 'inbound_items',
    docType: 'inbound_item_old',
    parentRef: { from: '入庫單號', docType: 'inbound_order', col: 'inbound_order_id', required: true },
    codeRefs: [
      { from: '商品編號', master: 'product', col: 'product_id' },
      { from: '倉庫代碼', master: 'warehouse', col: 'warehouse_id' },
    ],
    skip: ['倉庫名稱', '入庫年', '入庫月', '入庫日', '入庫存日期時間'],
    columns: {
      商品編號: 'product_code',
      商品名稱: 'product_name',
      規格: 'spec',
      單位: 'unit',
      庫存編號: 'stock_code',
      數量: ['quantity', 'num'],
      備註: 'notes',
    },
  },
  {
    file: '庫存_出庫單.csv',
    table: 'outbound_orders',
    docType: 'outbound_order',
    docNoFrom: '出庫單號',
    statusFrom: '簽核',
    skip: ['出庫年', '出庫月', '出庫日'],
    columns: {
      日期: ['order_date', 'date'],
      出貨單號: 'shipment_no',
      扣庫存日期時間: ['deducted_at', 'ts'],
      單據備註: 'notes',
      建檔人員: ['created_by', 'user'],
      最後修改人員: ['updated_by', 'user'],
      最後修改日期時間: ['updated_at', 'ts'],
    },
  },
  {
    file: '盤點_出庫清單.csv',
    table: 'outbound_items',
    docType: 'outbound_item',
    parentRef: { from: '出庫單號', docType: 'outbound_order', col: 'outbound_order_id', required: true },
    codeRefs: [{ from: '商品編號', master: 'product', col: 'product_id' }],
    skip: ['出庫年', '出庫月', '出庫日'],
    columns: {
      商品編號: 'product_code',
      商品名稱: 'product_name',
      規格: 'spec',
      單位: 'unit',
      庫存編號: 'stock_code',
      倉庫數量: ['warehouse_qty', 'num'],
      使用數量: ['used_qty', 'num'],
      使用後數量: ['qty_after_use', 'num'],
      備註: 'notes',
    },
  },
  {
    file: '審核_訂金請款單.csv',
    table: 'deposit_requests',
    docType: 'deposit_request',
    docNoFrom: 'index', // 訂金請款單以流水 index（00019…）作為單號
    statusFrom: '簽核狀態',
    refs: [{ from: '請採購單來源', docType: 'purchase_request', col: 'pr_id' }],
    codeRefs: [{ from: '廠商編號', master: 'vendor', col: 'vendor_id' }],
    skip: ['廠商編號map'],
    columns: {
      廠商編號: 'vendor_code',
      名稱: 'vendor_name',
      簡稱: 'vendor_short_name',
      訂金金額: ['deposit_amount', 'num'],
      合計金額: ['total_amount', 'num'],
      訂金請款資訊: ['deposit_info_url', 'file'],
      要求匯款期限: ['remittance_deadline', 'date'],
      匯款日期: ['remittance_date', 'date'],
      匯款月份: 'remittance_month',
      結帳日: 'closing_day',
      銀行名稱: 'bank_name',
      分行名稱: 'bank_branch',
      銀行通匯代號: 'bank_swift_code',
      帳號: 'bank_account_no',
      戶名: 'bank_account_name',
      建立日期: ['created_at', 'ts'],
      最後更新日期: ['updated_at', 'ts'],
    },
  },
  {
    file: '審核_採購請款單.csv',
    table: 'ap_requests',
    docType: 'ap_request',
    docNoFrom: '採購請款單號',
    statusFrom: '簽核狀態',
    // CSV 沒有進貨驗收單參照欄 → gr_id 維持 NULL
    codeRefs: [{ from: '廠商編號', master: 'vendor', col: 'vendor_id' }],
    columns: {
      廠商編號: 'vendor_code',
      名稱: 'vendor_name',
      國別: 'country',
      統一編號: 'tax_id',
      請款月份: 'billing_month',
      採購請款總金額: ['ap_total_amount', 'num'],
      金額調整: ['amount_adjustment', 'num'],
      調整備註: 'adjustment_notes',
      合計金額: ['total_amount', 'num'],
      是否分期: ['is_installment', 'bool'],
      已分期請款總金額: ['installment_total_amount', 'num'],
      付款方式: 'payment_method',
      付款條件: 'payment_terms',
      結帳日: 'closing_day',
      匯款期限: ['remittance_deadline', 'date'],
      銀行名稱: 'bank_name',
      分行名稱: 'bank_branch',
      銀行通匯代號: 'bank_swift_code',
      帳號: 'bank_account_no',
      戶名: 'bank_account_name',
      建立使用者: ['created_by', 'user'],
    },
  },
  {
    file: '審核_分期請款單.csv',
    table: 'installment_requests',
    docType: 'installment_request',
    docNoFrom: '請款單號',
    statusFrom: '簽核狀態',
    refs: [{ from: '採購請款單號', docType: 'ap_request', col: 'ap_id' }],
    columns: {
      分期期數: ['installment_no', 'int'],
      請款月份: 'billing_month',
      金額: ['amount', 'num'],
      發票號碼: 'invoice_no',
      發票日期: ['invoice_date', 'date'],
      發票檔案: ['invoice_file_url', 'file'],
      簽核開始的日期時間: ['submitted_at', 'ts'],
      備註: 'notes',
      建立使用者: ['created_by', 'user'],
    },
  },
  {
    file: '審核_廠商審核評估.csv',
    table: 'vendor_evaluations',
    docType: 'vendor_evaluation',
    docNoFrom: '廠商評估編號',
    statusFrom: '簽核狀態',
    columns: {
      名稱: 'name',
      簡稱: 'short_name',
      廠商類別: 'vendor_category',
      國別: 'country',
      統一編號: 'tax_id',
      電話號碼: 'phone',
      傳真號碼: 'fax',
      聯絡窗口: 'contact_person',
      窗口電話: 'contact_phone',
      窗口手機: 'contact_mobile',
      'E-mail窗口': 'contact_email',
      '窗口E-mail': 'contact_email',
      會計聯絡人: 'accounting_contact',
      會計電話: 'accounting_phone',
      會計手機: 'accounting_mobile',
      '會計E-mail': 'accounting_email',
      帳單郵遞區號: 'billing_postal_code',
      帳單縣市及鄉鎮市區: 'billing_city_district',
      街道地址: 'street_address',
      完整帳單地址: 'full_billing_address',
      付款方式: 'payment_method',
      付款條件: 'payment_terms',
      結帳日: 'closing_day',
      國貿條規: 'incoterms',
      銀行名稱: 'bank_name',
      分行名稱: 'bank_branch',
      銀行通匯代號: 'bank_swift_code',
      帳號: 'bank_account_no',
      戶名: 'bank_account_name',
      匯款帳號存摺影本: ['bankbook_copy_url', 'file'],
      公司發票印章: ['invoice_seal_url', 'file'],
      實收資本額: 'paid_in_capital',
      去年營收: 'last_year_revenue',
      填表人: ['filled_by_id', 'user'],
      填表人簽章: ['filler_signature_url', 'file'],
      填表部門: 'filling_department',
      備註: 'notes',
      建立使用者: ['created_by', 'user'],
    },
  },
  {
    file: '審核_商品審核評估.csv',
    table: 'product_evaluations',
    docType: 'product_evaluation',
    docNoFrom: '商品價格評估編號',
    statusFrom: '簽核狀態',
    refs: [{ from: '來源詢價單', docType: 'rfq', col: 'rfq_id' }],
    columns: {
      送出簽核人: ['submitted_by', 'user'],
      建立使用者: ['created_by', 'user'],
      建立日期: ['created_at', 'ts'],
    },
  },

  // ── intentionally skipped CSVs ─────────────────────────────
  {
    file: '採購_郵遞區號.csv',
    table: null,
    skipReason: '郵遞區號對照表改用程式常數，不入庫',
  },
  {
    file: '庫存_商品庫存.csv',
    table: null,
    skipReason: '與 採購_商品清冊.csv 同一張 Ragic 表的鏡像（238 筆、欄位相同），products 已從商品清冊匯入',
  },
]
