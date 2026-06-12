import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { userHasFeature } from '@/lib/job-role-features'
import { lockedFieldsFor } from '@/lib/procurement/field-locks'
import {
  RFQ_WRITABLE_FIELDS,
  pickRfqFields,
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

  const { data: stepsData, error: stepsError } = await service
    .from('procurement_approval_steps')
    .select('id, step_no, approver_kind, approver_value, resolved_user_id, status, acted_by, acted_at, comment')
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
  const lockedFields = lockedFieldsFor('rfq', { status: docRow.status as string, inquirer_id: docRow.inquirer_id as string | null }, me.id)

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
  if (requested.length === 0) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  // 簽核中欄位鎖定: strip locked fields for non-inquirer users; 400 when the
  // whole update was locked away (the caller had nothing it was allowed to change)
  const locked = lockedFieldsFor('rfq', doc, me.id)
  const update: Record<string, string | null> = {}
  for (const f of requested) {
    if (!locked.includes(f)) update[f] = fields[f]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: tr('errors.fieldsLocked') }, { status: 400 })
  }

  const { data, error } = await service
    .from('rfqs')
    .update({ ...update, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, doc_no, status')
    .single()

  if (error) {
    console.error('[procurement rfqs] update failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data, stripped: requested.filter(f => locked.includes(f)) })
}
