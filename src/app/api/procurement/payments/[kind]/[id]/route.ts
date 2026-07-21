import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { userHasFeature } from '@/lib/job-role-features'
import {
  PAYMENT_DOC_TYPE,
  PAYMENT_TABLE,
  applyVendorInfo,
  canActOnStep,
  isPaymentKind,
  pickPaymentFields,
  requireProcurementUser,
  type PaymentKind,
  type StepRow,
} from '../../helpers'

// GET /api/procurement/payments/[kind]/[id] — document + approval steps
//   (+ can_act for the current user; for kind='ap' also the installment list
//    backing the 分期區塊: rows + non-voided total)
// PUT /api/procurement/payments/[kind]/[id] — update, drafts only

const DETAIL_SELECT: Record<PaymentKind, string> = {
  deposit: '*, pr:purchase_requests(id, doc_no)',
  ap: '*, gr:goods_receipts(id, doc_no)',
  installment: '*, ap:ap_requests(id, doc_no, is_installment, total_amount)',
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { kind, id } = await params
  if (!isPaymentKind(kind)) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const { data: doc } = await service.from(PAYMENT_TABLE[kind]).select(DETAIL_SELECT[kind]).eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  const docRow = doc as unknown as Record<string, unknown>

  const { data: stepsData, error: stepsError } = await service
    .from('procurement_approval_steps')
    .select('id, step_no, approver_kind, approver_value, resolved_user_id, status, acted_by, acted_at, comment')
    .eq('doc_type', PAYMENT_DOC_TYPE[kind])
    .eq('doc_id', id)
    .order('step_no', { ascending: true })
  if (stepsError) {
    console.error('[procurement payments] steps load failed:', stepsError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  const steps = (stepsData ?? []) as StepRow[]

  // 採購請款單 分期區塊: the AP's installment requests + non-voided running total
  let installments: Record<string, unknown>[] | undefined
  let installmentTotal: number | undefined
  if (kind === 'ap') {
    const { data: insData } = await service
      .from('installment_requests')
      .select('id, doc_no, status, installment_no, billing_month, amount, invoice_no, invoice_date, notes, created_at')
      .eq('ap_id', id)
      .order('installment_no', { ascending: true, nullsFirst: false })
    installments = (insData as Record<string, unknown>[] | null) ?? []
    installmentTotal = installments
      .filter(i => i.status !== 'voided')
      .reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
  }

  // Resolve display names for everyone referenced by the doc + steps
  const userIds = new Set<string>()
  for (const key of ['created_by', 'updated_by', 'voided_by'] as const) {
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

  return NextResponse.json({
    data: {
      doc: {
        ...docRow,
        created_by_name: typeof docRow.created_by === 'string' ? names[docRow.created_by] ?? null : null,
        voided_by_name: typeof docRow.voided_by === 'string' ? names[docRow.voided_by] ?? null : null,
      },
      steps: enrichedSteps,
      can_act: canAct,
      current_step_kind: currentStep?.approver_kind ?? null,
      ...(kind === 'ap' ? { installments, installment_total: installmentTotal } : {}),
    },
  })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const t = await getTranslations('apiErrors')
  const tp = await getTranslations('procurement.payments')
  const { kind, id } = await params
  if (!isPaymentKind(kind)) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const write = procurementWriteClient()
  const { data: doc } = await service
    .from(PAYMENT_TABLE[kind])
    .select('id, status, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  // Drafts only — once submitted the document is locked to the approval flow
  if (doc.status !== 'draft') return NextResponse.json({ error: tp('errors.onlyDraftEditable') }, { status: 400 })

  // Only the creator, procurement managers or admins may edit a draft
  const canEdit =
    doc.created_by === me.id ||
    userHasFeature(me.role, me.job_role, me.granted_features, 'procurement_manage')
  if (!canEdit) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const update = pickPaymentFields(body, kind)

  // Changing the vendor re-pulls bank / payment info from the vendors master
  if ((kind === 'deposit' || kind === 'ap') && typeof body.vendor_id === 'string' && body.vendor_id.trim()) {
    const ok = await applyVendorInfo(service, kind, body.vendor_id.trim(), update, new Set(Object.keys(body)))
    if (!ok) return NextResponse.json({ error: tp('errors.vendorNotFound') }, { status: 404 })
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const { data, error } = await write
    .from(PAYMENT_TABLE[kind])
    .update({ ...update, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, doc_no, status')
    .single()

  if (error) {
    console.error('[procurement payments] update failed:', error)
    return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}
