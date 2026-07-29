import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { userHasFeature } from '@/lib/job-role-features'
import { lockedFieldsFor, lockedItemFieldsFor } from '@/lib/procurement/field-locks'
import {
  RFQ_WRITABLE_FIELDS,
  pickRfqFields,
  pickRfqItems,
  pickRfqQuotes,
  requireProcurementUser,
  type ProcurementUser,
} from '../helpers'

// GET /api/procurement/rfqs/[id] — document + approval steps (+ can_act for the
//   current step + locked_fields for the signed-in user, per field-locks.ts)
// PUT /api/procurement/rfqs/[id] — update.
//   draft: full edit (creator / procurement_manage / admin).
//   in_approval: spec §三-1 rule 2 — only the 詢價人員 (inquirer_id) may edit the
//   locked fields; for everyone else locked fields are stripped from the update
//   and the request fails with 400 when every requested field was locked.
//   approved / rejected / voided: not editable (作廢並複製 to restart).

interface StepRow {
  id: string
  step_no: number
  /** 關卡名稱 i18n key（送簽時寫入）；舊資料為 null */
  step_name: string | null
  approver_kind: 'job_role' | 'manager_of' | 'doc_field' | 'anyone'
  approver_value: string | null
  resolved_user_id: string | null
  status: 'pending' | 'current' | 'approved' | 'rejected' | 'skipped'
  acted_by: string | null
  acted_at: string | null
  comment: string | null
}

/** Same authorization rule as approval-engine's canActOnStep (engine re-checks on act) */
function canActOnStep(user: ProcurementUser, step: StepRow): boolean {
  if (user.role === 'admin') return true
  if (step.resolved_user_id && step.resolved_user_id === user.id) return true
  switch (step.approver_kind) {
    case 'job_role':
      return user.job_role === step.approver_value
    case 'anyone':
    case 'manager_of':
      return !!step.approver_value && userHasFeature(user.role, user.job_role, user.granted_features, step.approver_value)
    default:
      return false
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { id } = await params

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const { data: doc } = await service.from('rfqs').select('*').eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  const docRow = doc as Record<string, unknown>

  // 回報「歷史詢價單內容不完整」：品項/廠商/報價/採購單號其實都在下游表且已回連本詢價單，
  // 只是明細頁未 join。以下以唯讀方式帶出（RLS 由 createServiceClient 依使用者身分把關）。
  // (a) 相關採購單：purchase_requests.rfq_id → 採購單號 + 廠商 + 合計 + 進貨狀態
  const { data: linkedPrsData } = await service
    .from('purchase_requests')
    .select('id, doc_no, status, vendor_name, total_amount, fulfillment_status, purchase_date')
    .eq('rfq_id', id)
    .order('purchase_date', { ascending: true })
  const linkedPrs = linkedPrsData ?? []
  // (b) 品項與數量：pr_items（依採購單分組顯示）
  let prItems: Record<string, unknown>[] = []
  const prIds = linkedPrs.map(p => p.id)
  if (prIds.length > 0) {
    const { data: itemsData } = await service
      .from('pr_items')
      .select('pr_id, line_no, product_code, product_name, spec, unit, unit_price, quantity, amount')
      .in('pr_id', prIds)
      .order('pr_id', { ascending: true })
      .order('line_no', { ascending: true })
    prItems = (itemsData ?? []) as Record<string, unknown>[]
  }
  // (c) 廠商與報價結果：vendor_products.source_rfq_no = 本詢價單號
  let quotes: Record<string, unknown>[] = []
  const docNo = docRow.doc_no
  if (typeof docNo === 'string' && docNo) {
    const { data: quotesData } = await service
      .from('vendor_products')
      .select('vendor_name, product_code, product_name, spec, unit, unit_price, quote_date')
      .eq('source_rfq_no', docNo)
      .is('deleted_at', null)
      .order('quote_date', { ascending: false })
    quotes = (quotesData ?? []) as Record<string, unknown>[]
  }

  // 本張詢價單「自己的」請購商品與逐項報價（可編輯）。
  // 注意與上方 (a)(b)(c) 區隔：那些是從關聯的請採購單帶出的唯讀資料。
  const { data: ownItemsData } = await service
    .from('rfq_items')
    .select('id, line_no, product_id, product_code, product_name, spec, unit, quantity, usage_notes, suggested_vendor_id, notes')
    .eq('rfq_id', id)
    .order('line_no', { ascending: true })
    .order('created_at', { ascending: true })
  const ownItems = ownItemsData ?? []
  let ownQuotes: Record<string, unknown>[] = []
  if (ownItems.length > 0) {
    const { data: q } = await service
      .from('rfq_quotes')
      .select('id, rfq_item_id, vendor_id, vendor_name, vendor_product_code, vendor_product_name, unit, unit_price, quote_date, is_selected, notes')
      .in('rfq_item_id', ownItems.map(i => i.id))
      .order('created_at', { ascending: true })
    ownQuotes = (q ?? []) as Record<string, unknown>[]
  }

  const { data: stepsData, error: stepsError } = await service
    .from('procurement_approval_steps')
    .select('id, step_no, step_name, approver_kind, approver_value, resolved_user_id, status, acted_by, acted_at, comment')
    .eq('doc_type', 'rfq')
    .eq('doc_id', id)
    .order('step_no', { ascending: true })
  if (stepsError) {
    console.error('[procurement rfqs] steps load failed:', stepsError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  const steps = (stepsData ?? []) as StepRow[]

  // Resolve display names for everyone referenced by the doc + steps
  const userIds = new Set<string>()
  for (const key of ['created_by', 'updated_by', 'requester_id', 'inquirer_id', 'reviewer_id', 'voided_by'] as const) {
    const v = docRow[key]
    if (typeof v === 'string') userIds.add(v)
  }
  for (const s of steps) {
    if (s.resolved_user_id) userIds.add(s.resolved_user_id)
    if (s.acted_by) userIds.add(s.acted_by)
  }
  const names: Record<string, string | null> = {}
  if (userIds.size > 0) {
    const { data: users } = await service
      .from('users')
      .select('id, display_name')
      .in('id', Array.from(userIds))
    for (const u of users ?? []) names[u.id] = u.display_name
  }
  const nameOf = (key: string): string | null => {
    const v = docRow[key]
    return typeof v === 'string' ? names[v] ?? null : null
  }

  const enrichedSteps = steps.map(s => ({
    ...s,
    resolved_user_name: s.resolved_user_id ? names[s.resolved_user_id] ?? null : null,
    acted_by_name: s.acted_by ? names[s.acted_by] ?? null : null,
  }))

  const currentStep = docRow.status === 'in_approval' && docRow.current_step
    ? steps.find(s => s.step_no === docRow.current_step && s.status === 'current') ?? null
    : null
  const canAct = !!currentStep && canActOnStep(me, currentStep)

  // 簽核中欄位鎖定 — which header columns this user must not modify right now
  const lockDoc = { status: docRow.status as string, inquirer_id: docRow.inquirer_id as string | null }
  const lockedFields = lockedFieldsFor('rfq', lockDoc, me.id)
  // 明細/報價層鎖定（欄位橫跨 rfq_items 與 rfq_quotes，見 field-locks.ts）
  const lockedItemFields = lockedItemFieldsFor('rfq', lockDoc, me.id)

  return NextResponse.json({
    data: {
      doc: {
        ...docRow,
        created_by_name: nameOf('created_by'),
        requester_name: nameOf('requester_id'),
        inquirer_name: nameOf('inquirer_id'),
        reviewer_name: nameOf('reviewer_id'),
        voided_by_name: nameOf('voided_by'),
      },
      steps: enrichedSteps,
      can_act: canAct,
      current_step_kind: currentStep?.approver_kind ?? null,
      locked_fields: lockedFields,
      locked_item_fields: lockedItemFields,
      // 本單自己的資料（可編輯）
      rfq_items: ownItems,
      rfq_quotes: ownQuotes,
      // 關聯請採購單帶出的唯讀資料
      linked_purchase_requests: linkedPrs,
      pr_items: prItems,
      quotes,
    },
  })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const tr = await getTranslations('procurement.rfqs')
  const { id } = await params

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const write = procurementWriteClient()
  const { data: doc } = await service
    .from('rfqs')
    .select('id, status, created_by, inquirer_id')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  if (doc.status !== 'draft' && doc.status !== 'in_approval') {
    return NextResponse.json({ error: tr('errors.notEditable') }, { status: 400 })
  }

  // creator / procurement_manage / admin; during approval the 詢價人員 may also edit
  const canEdit =
    doc.created_by === me.id ||
    userHasFeature(me.role, me.job_role, me.granted_features, 'procurement_manage') ||
    (doc.status === 'in_approval' && doc.inquirer_id === me.id)
  if (!canEdit) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const { fields, invalid } = pickRfqFields(body)
  if (invalid) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const requested = Object.keys(fields).filter(f => (RFQ_WRITABLE_FIELDS as readonly string[]).includes(f))

  // 簽核中欄位鎖定: strip locked fields for non-inquirer users
  const locked = lockedFieldsFor('rfq', doc, me.id)
  const update: Record<string, unknown> = {}
  for (const f of requested) {
    if (!locked.includes(f)) update[f] = fields[f]
  }

  // 廠商報價單附件（rfqs.quote_files，storage bucket 'procurement' 的 object path 陣列）
  let quoteFilesRequested = false
  if ('quote_files' in body) {
    quoteFilesRequested = true
    const raw = body.quote_files
    if (!Array.isArray(raw) || raw.some(p => typeof p !== 'string')) {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    if (!locked.includes('quote_files')) update.quote_files = raw as string[]
  }

  // 明細/報價層鎖定（欄位橫跨 rfq_items 與 rfq_quotes）
  const lockedItem = lockedItemFieldsFor('rfq', doc, me.id)

  // 請購商品（rfq_items）— merge 模式：帶 id 的更新、無 id 的新增、payload 未含的刪除
  let items: Record<string, unknown>[] | null = null
  if ('items' in body) {
    const r = pickRfqItems(body.items, lockedItem)
    if (r.invalid) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    items = r.items
  }

  // 逐項報價（rfq_quotes）— { [rfq_item_id]: Quote[] }，每個品項 replace
  let quotesByItem: Record<string, Record<string, unknown>[]> | null = null
  if ('quotes' in body) {
    const raw = body.quotes
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    quotesByItem = {}
    for (const [itemId, list] of Object.entries(raw as Record<string, unknown>)) {
      const r = pickRfqQuotes(list, lockedItem)
      if (r.invalid) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
      quotesByItem[itemId] = r.quotes
    }
  }

  const hasHeader = Object.keys(update).length > 0
  if (!hasHeader && items === null && quotesByItem === null) {
    // 送出的欄位全被鎖定（或根本沒帶可寫欄位）
    const askedSomething = requested.length > 0 || quoteFilesRequested
    return NextResponse.json(
      { error: askedSomething ? tr('errors.fieldsLocked') : t('common.invalidRequest') },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const patch = { ...update, updated_by: me.id, updated_at: now }

  let data: { id: string; doc_no: string | null; status: string } | null = null
  if (items !== null) {
    // 表頭 + 明細一次原子寫入（泛用 RPC，表名當參數）
    const { data: rpcData, error } = await write.rpc('procurement_update_with_items', {
      p_parent_table: 'rfqs',
      p_parent_id: id,
      p_parent_patch: patch,
      p_item_table: 'rfq_items',
      p_fk_column: 'rfq_id',
      p_items: items,
      p_sync_mode: 'merge',
    })
    if (error || !rpcData) {
      console.error('[procurement rfqs] update with items failed:', error)
      return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
    }
    data = { id: rpcData.id, doc_no: rpcData.doc_no, status: rpcData.status }
  } else if (hasHeader) {
    const { data: upd, error } = await write
      .from('rfqs')
      .update(patch)
      .eq('id', id)
      .select('id, doc_no, status')
      .single()
    if (error) {
      console.error('[procurement rfqs] update failed:', error)
      return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
    }
    data = upd
  }

  // 報價是「孫層」（rfqs → rfq_items → rfq_quotes），泛用 RPC 只吃兩層，
  // 因此改以 rfq_items 為 parent 逐品項 replace：單一品項的報價是原子的，
  // 但跨品項不在同一交易內（報價為詢價人填寫的參考資料，非帳務關鍵，可接受）。
  if (quotesByItem) {
    const itemIds = Object.keys(quotesByItem)
    if (itemIds.length > 0) {
      // 只允許寫入屬於本張詢價單的品項，避免越權寫他單
      const { data: owned } = await service.from('rfq_items').select('id').eq('rfq_id', id).in('id', itemIds)
      const ownedIds = new Set((owned ?? []).map(r => r.id as string))
      for (const itemId of itemIds) {
        if (!ownedIds.has(itemId)) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
        const { error } = await write.rpc('procurement_update_with_items', {
          p_parent_table: 'rfq_items',
          p_parent_id: itemId,
          p_parent_patch: { updated_at: now },
          p_item_table: 'rfq_quotes',
          p_fk_column: 'rfq_item_id',
          p_items: quotesByItem[itemId],
          p_sync_mode: 'replace',
        })
        if (error) {
          console.error('[procurement rfqs] quotes write failed:', error, 'item:', itemId)
          // uq_rfq_quotes_one_selected_per_item：一個品項至多一筆採用（API 端已擋，
          // 這裡是並發／其他寫入路徑的最後防線）→ 回 400 而非 500
          if (error.code === '23505') {
            return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
          }
          return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
        }
      }
    }
  }

  if (!data) {
    const { data: cur } = await service.from('rfqs').select('id, doc_no, status').eq('id', id).single()
    data = cur
  }
  const strippedHeader = requested.filter(f => locked.includes(f))
  if (quoteFilesRequested && locked.includes('quote_files')) strippedHeader.push('quote_files')
  return NextResponse.json({ data, stripped: strippedHeader })
}
