import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { DOC_TYPE_META, type DocType, type DocStatus } from '@/lib/procurement/doc-types'
import { JOB_ROLE_DEFAULT_FEATURES } from '@/lib/job-role-features'
import type { JobRole } from '@/types'

// GET /api/procurement/inbox — the caller's pending approval steps (我的待簽),
// joined with basic document info.
//
// A step (procurement_approval_steps, status = 'current') belongs to the
// caller's inbox when — mirroring approval-engine.canActOnStep, minus the
// admin blanket so admin inboxes aren't flooded:
//   - resolved_user_id = me, or
//   - approver_kind = 'job_role' and approver_value = my job_role, or
//   - approver_kind = 'anyone' and I hold the step's notify feature
//     (procurement feature, via job_role defaults or granted_features), or
//   - approver_kind = 'manager_of' (unresolved) and I hold its actable feature
//     (請款簽核主管 = procurement_payment_approve).

interface StepRow {
  id: string
  doc_type: string
  doc_id: string
  step_no: number
  approver_kind: 'job_role' | 'manager_of' | 'doc_field' | 'anyone'
  approver_value: string | null
  resolved_user_id: string | null
  acted_at: string | null
  created_at: string
}

interface DocInfoRow {
  id: string
  doc_no: string
  status: DocStatus
  created_by: string | null
  created_at: string
}

export interface InboxItem {
  doc_type: DocType
  doc_id: string
  doc_no: string
  step_no: number
  applicant: { id: string | null; display_name: string | null }
  /** when the document reached the caller's step (step 1 → submit time; later steps → previous step's acted_at) */
  arrived_at: string
}

interface UserRow {
  id: string
  role: string
  job_role: string
  granted_features: string[] | null
}

/** Feature check via job_role defaults + granted_features (no admin blanket — inbox matching only) */
function holdsFeature(user: UserRow, feature: string): boolean {
  const defaults = JOB_ROLE_DEFAULT_FEATURES[user.job_role as JobRole] ?? []
  return defaults.includes(feature) || (user.granted_features ?? []).includes(feature)
}

function stepMatches(user: UserRow, step: StepRow): boolean {
  if (step.resolved_user_id) return step.resolved_user_id === user.id
  switch (step.approver_kind) {
    case 'job_role':
      return step.approver_value === user.job_role
    case 'anyone':
      return !!step.approver_value && holdsFeature(user, step.approver_value)
    case 'manager_of':
      return !!step.approver_value && holdsFeature(user, step.approver_value)
    default:
      return false
  }
}

export async function GET() {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: userData } = await service
    .from('users')
    .select('id, role, job_role, granted_features')
    .eq('id', user.id)
    .single()
  const me = userData as UserRow | null
  if (!me) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  // All currently-awaiting steps (small, indexed on status), filtered to mine in JS
  const { data: stepData, error: stepsError } = await service
    .from('procurement_approval_steps')
    .select('id, doc_type, doc_id, step_no, approver_kind, approver_value, resolved_user_id, acted_at, created_at')
    .eq('status', 'current')
  if (stepsError) {
    console.error('[procurement inbox] failed to load steps:', stepsError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  const mine = ((stepData as StepRow[] | null) ?? []).filter(
    s => s.doc_type in DOC_TYPE_META && stepMatches(me, s)
  )

  // Feature gate (procurement_unit / procurement_manage / admin). Users named as
  // approvers (resolved steps, job roles) still get their own pending items.
  const hasProcurementAccess =
    me.role === 'admin' || holdsFeature(me, 'procurement_unit') || holdsFeature(me, 'procurement_manage')
  if (!hasProcurementAccess && mine.length === 0) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  // Join basic document info per doc type (+ previous step acted_at for arrived_at)
  const byType = new Map<DocType, StepRow[]>()
  for (const s of mine) {
    const dt = s.doc_type as DocType
    const list = byType.get(dt) ?? []
    list.push(s)
    byType.set(dt, list)
  }

  const items: InboxItem[] = []
  const applicantIds = new Set<string>()

  for (const [docType, steps] of byType) {
    const docIds = steps.map(s => s.doc_id)

    const { data: docData, error: docError } = await service
      .from(DOC_TYPE_META[docType].table)
      .select('id, doc_no, status, created_by, created_at')
      .in('id', docIds)
    if (docError) {
      console.error(`[procurement inbox] failed to load ${docType} docs:`, docError)
      continue
    }
    const docs = new Map(((docData as DocInfoRow[] | null) ?? []).map(d => [d.id, d]))

    // previous steps → arrived_at for step_no > 1
    const multiStepIds = steps.filter(s => s.step_no > 1).map(s => s.doc_id)
    const prevActedAt = new Map<string, string>()
    if (multiStepIds.length > 0) {
      const { data: prevData } = await service
        .from('procurement_approval_steps')
        .select('doc_id, step_no, acted_at')
        .eq('doc_type', docType)
        .in('doc_id', multiStepIds)
      for (const p of (prevData as Pick<StepRow, 'doc_id' | 'step_no' | 'acted_at'>[] | null) ?? []) {
        if (p.acted_at) prevActedAt.set(`${p.doc_id}:${p.step_no}`, p.acted_at)
      }
    }

    for (const s of steps) {
      const doc = docs.get(s.doc_id)
      if (!doc || doc.status !== 'in_approval') continue
      if (doc.created_by) applicantIds.add(doc.created_by)
      items.push({
        doc_type: docType,
        doc_id: s.doc_id,
        doc_no: doc.doc_no,
        step_no: s.step_no,
        applicant: { id: doc.created_by, display_name: null },
        arrived_at:
          (s.step_no > 1 ? prevActedAt.get(`${s.doc_id}:${s.step_no - 1}`) : undefined) ?? s.created_at,
      })
    }
  }

  // Applicant display names
  if (applicantIds.size > 0) {
    const { data: userRows } = await service
      .from('users')
      .select('id, display_name')
      .in('id', [...applicantIds])
    const names = new Map(
      ((userRows as { id: string; display_name: string | null }[] | null) ?? []).map(u => [u.id, u.display_name])
    )
    for (const item of items) {
      if (item.applicant.id) item.applicant.display_name = names.get(item.applicant.id) ?? null
    }
  }

  items.sort((a, b) => (a.arrived_at < b.arrived_at ? 1 : -1))

  return NextResponse.json({ data: items })
}
