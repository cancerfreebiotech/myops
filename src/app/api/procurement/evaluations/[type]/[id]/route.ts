import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { userHasFeature } from '@/lib/job-role-features'
import {
  EVAL_DOC_TYPE,
  EVAL_TABLE,
  VENDOR_EVAL_FIELDS,
  isEvalType,
  pickStringFields,
  requireProcurementUser,
  type ProcurementUser,
} from '../../helpers'

// GET /api/procurement/evaluations/[type]/[id] — document + approval steps (+ can the
//   current user act on the current step, mirroring approval-engine authorization)
// PUT /api/procurement/evaluations/[type]/[id] — update, drafts only

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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { type, id } = await params
  if (!isEvalType(type)) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const select = type === 'vendor' ? '*' : '*, rfq:rfqs(id, doc_no)'
  const { data: doc } = await service.from(EVAL_TABLE[type]).select(select).eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  const docRow = doc as unknown as Record<string, unknown>

  const { data: stepsData, error: stepsError } = await service
    .from('procurement_approval_steps')
    .select('id, step_no, approver_kind, approver_value, resolved_user_id, status, acted_by, acted_at, comment')
    .eq('doc_type', EVAL_DOC_TYPE[type])
    .eq('doc_id', id)
    .order('step_no', { ascending: true })
  if (stepsError) {
    console.error('[procurement evaluations] steps load failed:', stepsError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  const steps = (stepsData ?? []) as StepRow[]

  // Resolve display names for everyone referenced by the doc + steps
  const userIds = new Set<string>()
  for (const key of ['created_by', 'updated_by', 'filled_by_id', 'submitted_by'] as const) {
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
      },
      steps: enrichedSteps,
      can_act: canAct,
      current_step_kind: currentStep?.approver_kind ?? null,
    },
  })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const t = await getTranslations('apiErrors')
  const te = await getTranslations('procurement.evaluations')
  const { type, id } = await params
  if (!isEvalType(type)) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const write = procurementWriteClient()
  const { data: doc } = await service
    .from(EVAL_TABLE[type])
    .select('id, status, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  // Drafts only — once submitted the document is locked to the approval flow
  if (doc.status !== 'draft') return NextResponse.json({ error: te('errors.onlyDraftEditable') }, { status: 400 })

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

  let update: Record<string, unknown>
  if (type === 'vendor') {
    const fields = pickStringFields(body, VENDOR_EVAL_FIELDS)
    if ('name' in fields && !fields.name) return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    update = fields
  } else {
    update = {}
    if ('rfq_doc_no' in body) {
      const rfqDocNo = typeof body.rfq_doc_no === 'string' ? body.rfq_doc_no.trim() : ''
      if (rfqDocNo) {
        const { data: rfq } = await service.from('rfqs').select('id').eq('doc_no', rfqDocNo).maybeSingle()
        if (!rfq) return NextResponse.json({ error: te('errors.rfqNotFound') }, { status: 404 })
        update.rfq_id = rfq.id
      } else {
        update.rfq_id = null
      }
    }
    if ('notes' in body) update.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const { data, error } = await write
    .from(EVAL_TABLE[type])
    .update({ ...update, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, doc_no, status')
    .single()

  if (error) {
    console.error('[procurement evaluations] update failed:', error)
    return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}
