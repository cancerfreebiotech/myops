import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { userHasFeature } from '@/lib/job-role-features'
import {
  computeTotals,
  normalizeItems,
  pickHeaderFields,
  requireProcurementUser,
  round2,
  type ProcurementUser,
} from '../helpers'

// GET    /api/procurement/purchase-requests/[id] — doc + pr_items + approval steps
//        (+ can the current user act on the current step)
// PUT    /api/procurement/purchase-requests/[id] — update, drafts only;
//        `items` = full batch upsert (rows without id inserted, with id updated,
//        existing rows missing from the payload deleted)
// DELETE /api/procurement/purchase-requests/[id] — delete a draft

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
    .from('purchase_requests')
    .select('*, rfq:rfqs(id, doc_no)')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  const docRow = doc as unknown as Record<string, unknown>

  const [{ data: itemsData, error: itemsError }, { data: stepsData, error: stepsError }] = await Promise.all([
    service
      .from('pr_items')
      .select('*')
      .eq('pr_id', id)
      .order('line_no', { ascending: true }),
    service
      .from('procurement_approval_steps')
      .select('id, step_no, approver_kind, approver_value, resolved_user_id, status, acted_by, acted_at, comment')
      .eq('doc_type', 'purchase_request')
      .eq('doc_id', id)
      .order('step_no', { ascending: true }),
  ])
  if (itemsError || stepsError) {
    console.error('[procurement purchase-requests] detail load failed:', itemsError ?? stepsError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  const steps = (stepsData ?? []) as StepRow[]

  // Resolve display names for everyone referenced by the doc + steps
  const userIds = new Set<string>()
  for (const key of ['created_by', 'updated_by', 'purchaser_id', 'voided_by'] as const) {
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
        purchaser_name: typeof docRow.purchaser_id === 'string' ? names[docRow.purchaser_id] ?? null : null,
        voided_by_name: typeof docRow.voided_by === 'string' ? names[docRow.voided_by] ?? null : null,
      },
      items: itemsData ?? [],
      steps: enrichedSteps,
      can_act: canAct,
      current_step_kind: currentStep?.approver_kind ?? null,
    },
  })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const tp = await getTranslations('procurement.purchaseRequests')
  const { id } = await params

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const { data: doc } = await service
    .from('purchase_requests')
    .select('id, status, created_by, tax_rate, shipping_fee')
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

  const header = pickHeaderFields(body)

  if (typeof header.rfq_id === 'string') {
    const { data: rfq } = await service.from('rfqs').select('id').eq('id', header.rfq_id).maybeSingle()
    if (!rfq) return NextResponse.json({ error: tp('errors.rfqNotFound') }, { status: 404 })
  }

  // ── items: full batch upsert / delete ──
  const items = 'items' in body ? normalizeItems(body.items) : undefined
  if (items === null) return NextResponse.json({ error: tp('errors.invalidItems') }, { status: 400 })

  if (items !== undefined) {
    const { data: existingData, error: existingError } = await service
      .from('pr_items')
      .select('id, received_qty')
      .eq('pr_id', id)
    if (existingError) {
      console.error('[procurement purchase-requests] items load failed:', existingError)
      return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
    }
    const existing = new Map((existingData ?? []).map(r => [r.id as string, (r.received_qty as number | null) ?? 0]))

    // payload ids must belong to this document
    for (const item of items) {
      if (item.id && !existing.has(item.id)) {
        return NextResponse.json({ error: tp('errors.invalidItems') }, { status: 400 })
      }
    }

    const keptIds = new Set(items.filter(i => i.id).map(i => i.id as string))
    const toDelete = Array.from(existing.keys()).filter(eid => !keptIds.has(eid))

    if (toDelete.length > 0) {
      const { error } = await service.from('pr_items').delete().eq('pr_id', id).in('id', toDelete)
      if (error) {
        console.error('[procurement purchase-requests] items delete failed:', error)
        return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
      }
    }

    const now = new Date().toISOString()
    for (const item of items) {
      const { id: itemId, ...fields } = item
      if (itemId) {
        const receivedQty = existing.get(itemId) ?? 0
        const { error } = await service
          .from('pr_items')
          .update({
            ...fields,
            pending_qty: fields.quantity !== null ? round2(fields.quantity - receivedQty) : null,
            updated_at: now,
          })
          .eq('id', itemId)
          .eq('pr_id', id)
        if (error) {
          console.error('[procurement purchase-requests] item update failed:', error)
          return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
        }
      } else {
        const { error } = await service
          .from('pr_items')
          .insert({ ...fields, pr_id: id, received_qty: 0, pending_qty: fields.quantity })
        if (error) {
          console.error('[procurement purchase-requests] item insert failed:', error)
          return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
        }
      }
    }

    // recompute the money columns from the new item set
    const taxRate = typeof header.tax_rate === 'number' ? header.tax_rate
      : header.tax_rate === null ? null
        : (doc.tax_rate as number | null)
    const shippingFee = typeof header.shipping_fee === 'number' ? header.shipping_fee
      : header.shipping_fee === null ? null
        : (doc.shipping_fee as number | null)
    Object.assign(header, computeTotals(items, taxRate, shippingFee))
  }

  if (Object.keys(header).length === 0 && items === undefined) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const { data, error } = await service
    .from('purchase_requests')
    .update({ ...header, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, doc_no, status, subtotal, tax_amount, total_amount')
    .single()
  if (error) {
    console.error('[procurement purchase-requests] update failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const tp = await getTranslations('procurement.purchaseRequests')
  const { id } = await params

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const { data: doc } = await service
    .from('purchase_requests')
    .select('id, status, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  // Drafts only — approved/rejected documents are voided (作廢), never deleted
  if (doc.status !== 'draft') return NextResponse.json({ error: tp('errors.onlyDraftDeletable') }, { status: 400 })

  const canDelete =
    doc.created_by === me.id ||
    userHasFeature(me.role, me.job_role, me.granted_features, 'procurement_manage')
  if (!canDelete) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  // pr_items cascade via FK; clear any stale approval steps from a prior submit
  await service.from('procurement_approval_steps').delete().eq('doc_type', 'purchase_request').eq('doc_id', id)
  const { error } = await service.from('purchase_requests').delete().eq('id', id)
  if (error) {
    console.error('[procurement purchase-requests] delete failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data: { ok: true } })
}
