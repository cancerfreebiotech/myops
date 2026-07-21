import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { userHasFeature } from '@/lib/job-role-features'
import { requireProcurementUser, type ProcurementUser } from '@/app/api/procurement/evaluations/helpers'
import { canEditVendorCode, pickGoodsReceiptFields } from '../helpers'

// GET /api/procurement/goods-receipts/[id]
//   → { data: { doc, items, deposit, steps, can_act, current_step_kind, can_edit_vendor_code } }
//   GR has no own line-item table — receiving lines (items) are the pr_items of
//   gr.pr_id. `deposit` resolves deposit_doc_no to the deposit_request for the
//   「來自訂金請款單 DEP-xxxx」 link.
// PUT /api/procurement/goods-receipts/[id] — update, drafts only.
//   vendor_code is rejected (403) without procurement_unit / procurement_manage
//   (spec rule 1 — 廠商編號唯讀).

interface StepRow {
  id: string
  step_no: number
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
  const { data: doc } = await service
    .from('goods_receipts')
    .select('*, pr:purchase_requests(id, doc_no)')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  const docRow = doc as unknown as Record<string, unknown>

  // Receiving lines come from the source PR's items (GR has no own item table)
  let items: Record<string, unknown>[] = []
  if (docRow.pr_id) {
    const { data: itemRows, error: itemsError } = await service
      .from('pr_items')
      .select('id, line_no, product_id, product_code, product_name, spec, unit, unit_price, quantity, amount, received_qty, pending_qty')
      .eq('pr_id', docRow.pr_id as string)
      .order('line_no', { ascending: true })
    if (itemsError) {
      console.error('[procurement goods-receipts] items load failed:', itemsError)
      return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
    }
    items = itemRows ?? []
  }

  // 已付訂金單號 → deposit_request (for the 「來自訂金請款單 DEP-xxxx」 link)
  let deposit: { id: string; doc_no: string | null; status: string } | null = null
  if (typeof docRow.deposit_doc_no === 'string' && docRow.deposit_doc_no) {
    const { data: dep } = await service
      .from('deposit_requests')
      .select('id, doc_no, status')
      .eq('doc_no', docRow.deposit_doc_no)
      .maybeSingle()
    deposit = dep ?? null
  }

  const { data: stepsData, error: stepsError } = await service
    .from('procurement_approval_steps')
    .select('id, step_no, approver_kind, approver_value, resolved_user_id, status, acted_by, acted_at, comment')
    .eq('doc_type', 'goods_receipt')
    .eq('doc_id', id)
    .order('step_no', { ascending: true })
  if (stepsError) {
    console.error('[procurement goods-receipts] steps load failed:', stepsError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  const steps = (stepsData ?? []) as StepRow[]

  // Resolve display names for everyone referenced by the doc + steps
  const userIds = new Set<string>()
  for (const key of ['created_by', 'updated_by', 'receiver_id', 'voided_by'] as const) {
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

  const enrichedSteps = steps.map(s => ({
    ...s,
    resolved_user_name: s.resolved_user_id ? names[s.resolved_user_id] ?? null : null,
    acted_by_name: s.acted_by ? names[s.acted_by] ?? null : null,
  }))

  const currentStep = docRow.status === 'in_approval' && docRow.current_step
    ? steps.find(s => s.step_no === docRow.current_step && s.status === 'current') ?? null
    : null
  const canAct = !!currentStep && canActOnStep(me, currentStep)

  const nameOf = (key: string) =>
    typeof docRow[key] === 'string' ? names[docRow[key] as string] ?? null : null

  return NextResponse.json({
    data: {
      doc: {
        ...docRow,
        created_by_name: nameOf('created_by'),
        updated_by_name: nameOf('updated_by'),
        receiver_name: nameOf('receiver_id'),
        voided_by_name: nameOf('voided_by'),
      },
      items,
      deposit,
      steps: enrichedSteps,
      can_act: canAct,
      current_step_kind: currentStep?.approver_kind ?? null,
      can_edit_vendor_code: canEditVendorCode(me),
    },
  })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const tg = await getTranslations('procurement.goodsReceipts')
  const { id } = await params

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const write = procurementWriteClient()
  const { data: doc } = await service
    .from('goods_receipts')
    .select('id, status, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  // Drafts only — once submitted the document is locked to the approval flow
  if (doc.status !== 'draft') return NextResponse.json({ error: tg('errors.onlyDraftEditable') }, { status: 400 })

  // 僅建檔人 / 採購管理者 / admin 可編輯草稿。同時擋住「非建檔人把 updated_by 寫成自己」，
  // 因為簽核第一關 = doc_field('updated_by')，否則可自任第一關簽核人。
  const canEdit = doc.created_by === me.id
    || userHasFeature(me.role, me.job_role, me.granted_features, 'procurement_manage')
  if (!canEdit) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const picked = pickGoodsReceiptFields(body)
  if (!picked.ok) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  const update = picked.fields

  // Spec rule 1: 廠商編號 read-only without procurement_unit / procurement_manage
  if ('vendor_code' in update && !canEditVendorCode(me)) {
    return NextResponse.json({ error: tg('errors.vendorCodeReadonly') }, { status: 403 })
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  // updated_by also feeds approval step 1 (確認 — 最後修改人員)
  const { data, error } = await write
    .from('goods_receipts')
    .update({ ...update, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, doc_no, status')
    .single()

  if (error) {
    console.error('[procurement goods-receipts] update failed:', error)
    return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}
