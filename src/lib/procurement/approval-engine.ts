// Server-only: generic multi-step approval engine for procurement documents.
//
// Flow definitions live in TypeScript (approval-flows.ts); approval state lives
// in the shared table `procurement_approval_steps`. All DB access goes through
// createServiceClient() — authorization is enforced here (and MFA at the API
// route), not via RLS.
//
// approver_value semantics per approver_kind (as stored on the step row):
//   job_role   → the role value ('coo' | 'ceo' | 'finance')
//   manager_of → the actableByFeature FeatureKey (or null)
//   doc_field  → the document column name the approver was resolved from
//   anyone     → the notifyFeature FeatureKey

import { createServiceClient } from '@/lib/supabase/server'
import { sendProactiveCard, sendProactiveMessage } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'
import { getBotApprovalPolicy, shouldOneTap } from '@/lib/bot-approval-policy'
import { buildApprovalCard } from '@/lib/drava-card'
import { JOB_ROLE_DEFAULT_FEATURES } from '@/lib/job-role-features'
import type { JobRole } from '@/types'
import { APPROVAL_FLOWS, type ApproverSpec } from './approval-flows'
import { DOC_AMOUNT_FIELD, DOC_TYPE_META, type DocStatus, type DocType } from './doc-types'

export type ApprovalAction = 'approve' | 'reject' | 'ack'

export type ApprovalErrorCode =
  | 'docNotFound'
  | 'onlyDraftSubmittable'
  | 'submitNotAllowed'
  | 'notInApproval'
  | 'notYourTurn'
  | 'approverUnresolved'
  | 'invalidAction'
  | 'ackOnlyNotifyStep'

export class ApprovalEngineError extends Error {
  constructor(public code: ApprovalErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'ApprovalEngineError'
  }
}

export interface SubmitResult {
  docNo: string
  stepCount: number
}

export interface ActResult {
  docStatus: DocStatus
  stepNo: number
  /** true when the document reached a terminal status (approved/rejected) */
  finished: boolean
  /** false when a post-approval hook failed (approval itself still succeeded) */
  hookOk: boolean
}

type Service = Awaited<ReturnType<typeof createServiceClient>>

interface UserRow {
  id: string
  role: string
  job_role: string
  granted_features: string[] | null
  manager_id: string | null
  language: string | null
  is_active: boolean
}

interface StepRow {
  id: string
  doc_type: DocType
  doc_id: string
  step_no: number
  approver_kind: 'job_role' | 'manager_of' | 'doc_field' | 'anyone'
  approver_value: string | null
  resolved_user_id: string | null
  status: 'pending' | 'current' | 'approved' | 'rejected' | 'skipped'
}

type DocRow = Record<string, unknown> & {
  id: string
  doc_no: string
  status: DocStatus
  current_step: number | null
  created_by: string | null
}

const STEPS_TABLE = 'procurement_approval_steps'

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function holdsFeature(user: Pick<UserRow, 'job_role' | 'granted_features'>, feature: string): boolean {
  const defaults = JOB_ROLE_DEFAULT_FEATURES[user.job_role as JobRole] ?? []
  return defaults.includes(feature) || (user.granted_features ?? []).includes(feature)
}

async function fetchDoc(service: Service, docType: DocType, docId: string): Promise<DocRow> {
  const { data } = await service
    .from(DOC_TYPE_META[docType].table)
    .select('*')
    .eq('id', docId)
    .maybeSingle()
  if (!data) throw new ApprovalEngineError('docNotFound')
  return data as DocRow
}

async function fetchUser(service: Service, userId: string): Promise<UserRow | null> {
  const { data } = await service
    .from('users')
    .select('id, role, job_role, granted_features, manager_id, language, is_active')
    .eq('id', userId)
    .maybeSingle()
  return (data as UserRow | null) ?? null
}

/** Active users holding a feature (via job_role defaults or granted_features — admin blanket access not counted) */
async function featureHolders(service: Service, feature: string): Promise<UserRow[]> {
  const { data } = await service
    .from('users')
    .select('id, role, job_role, granted_features, manager_id, language, is_active')
    .eq('is_active', true)
  return ((data as UserRow[] | null) ?? []).filter(u => holdsFeature(u, feature))
}

async function roleHolders(service: Service, jobRole: string): Promise<UserRow[]> {
  const { data } = await service
    .from('users')
    .select('id, role, job_role, granted_features, manager_id, language, is_active')
    .eq('is_active', true)
    .eq('job_role', jobRole)
  return (data as UserRow[] | null) ?? []
}

/**
 * Resolve one ApproverSpec against a document + submitter into the columns
 * stored on procurement_approval_steps.
 */
async function resolveSpec(
  service: Service,
  spec: ApproverSpec,
  doc: DocRow,
  submitterId: string
): Promise<{ approver_kind: StepRow['approver_kind']; approver_value: string | null; resolved_user_id: string | null }> {
  switch (spec.kind) {
    case 'doc_field': {
      const value = doc[spec.field]
      if (!value || typeof value !== 'string') throw new ApprovalEngineError('approverUnresolved', `doc field ${spec.field} is empty`)
      return { approver_kind: 'doc_field', approver_value: spec.field, resolved_user_id: value }
    }
    case 'job_role':
      return { approver_kind: 'job_role', approver_value: spec.value, resolved_user_id: null }
    case 'anyone':
      return { approver_kind: 'anyone', approver_value: spec.notifyFeature, resolved_user_id: null }
    case 'manager_of': {
      const submitter = await fetchUser(service, submitterId)
      const managerId = submitter?.manager_id ?? null
      if (managerId && managerId !== submitterId) {
        return { approver_kind: 'manager_of', approver_value: spec.actableByFeature ?? null, resolved_user_id: managerId }
      }
      // 送簽者本人即主管 / 無主管 → fallback
      if (spec.fallback) {
        const resolved = await resolveSpec(service, spec.fallback, doc, submitterId)
        return { ...resolved, approver_kind: 'manager_of', approver_value: spec.actableByFeature ?? null }
      }
      if (spec.actableByFeature) {
        // No personal manager, but feature holders (請款簽核主管) can act
        return { approver_kind: 'manager_of', approver_value: spec.actableByFeature, resolved_user_id: null }
      }
      throw new ApprovalEngineError('approverUnresolved', 'submitter has no manager and no fallback is defined')
    }
  }
}

/** Recipients to notify for a step (best effort) */
async function stepRecipients(service: Service, step: Pick<StepRow, 'approver_kind' | 'approver_value' | 'resolved_user_id'>): Promise<UserRow[]> {
  if (step.resolved_user_id) {
    const u = await fetchUser(service, step.resolved_user_id)
    return u ? [u] : []
  }
  if (step.approver_kind === 'job_role' && step.approver_value) {
    return roleHolders(service, step.approver_value)
  }
  if ((step.approver_kind === 'anyone' || step.approver_kind === 'manager_of') && step.approver_value) {
    return featureHolders(service, step.approver_value)
  }
  return []
}

type TeamsKey = Parameters<typeof teamsText>[1]

/** Read the document's monetary amount (if any) for one-tap threshold checks. */
function docAmount(docType: DocType, doc: DocRow): number | undefined {
  const field = DOC_AMOUNT_FIELD[docType]
  if (!field) return undefined
  const raw = doc[field]
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Notify a step's approver(s) that the document awaits their approval, as an
 * actionable Dr.Ave card. Per recipient: getBotApprovalPolicy() + shouldOneTap()
 * decide one-tap (approve/reject buttons) vs deep-link (前往簽核). Never throws.
 */
async function notifyStepApprovers(service: Service, docType: DocType, doc: DocRow, step: Pick<StepRow, 'step_no' | 'approver_kind' | 'approver_value' | 'resolved_user_id'>): Promise<void> {
  try {
    const recipients = await stepRecipients(service, step)
    if (recipients.length === 0) return

    const policy = await getBotApprovalPolicy()
    const amount = docAmount(docType, doc)
    const oneTap = shouldOneTap(policy, docType, amount)

    for (const r of recipients) {
      const label = teamsText(r.language, DOC_TYPE_META[docType].teamsLabelKey as TeamsKey)
      // New teamsMessages keys (added separately; cast like teamsLabelKey above).
      const title = teamsText(r.language, 'procurementApprovalCardTitle' as TeamsKey, { docType: label, docNo: doc.doc_no })
      const summary = amount === undefined
        ? teamsText(r.language, 'procurementApprovalCardBody' as TeamsKey, { docType: label, docNo: doc.doc_no })
        : teamsText(r.language, 'procurementApprovalCardBodyAmount' as TeamsKey, { docType: label, docNo: doc.doc_no, amount })
      const card = buildApprovalCard({
        docType,
        docId: doc.id,
        stepNo: step.step_no,
        title,
        summary,
        amount,
        oneTap,
        labels: {
          approve: teamsText(r.language, 'approvalCardApprove' as TeamsKey),
          reject: teamsText(r.language, 'approvalCardReject' as TeamsKey),
          open: teamsText(r.language, 'approvalCardOpen' as TeamsKey),
        },
      })
      await sendProactiveCard(r.id, card)
    }
  } catch (e) {
    console.error('[procurement] step notification failed:', e)
  }
}

/** Notify the document creator about the final outcome. Never throws. */
async function notifyApplicant(service: Service, doc: DocRow, outcome: 'approved' | 'rejected', reason?: string): Promise<void> {
  try {
    if (!doc.created_by) return
    const applicant = await fetchUser(service, doc.created_by)
    if (!applicant) return
    const text = outcome === 'approved'
      ? teamsText(applicant.language, 'procurementApproved', { docNo: doc.doc_no })
      : teamsText(applicant.language, 'procurementRejected', { docNo: doc.doc_no, reason: reason ?? '-' })
    await sendProactiveMessage(applicant.id, text)
  } catch (e) {
    console.error('[procurement] applicant notification failed:', e)
  }
}

// ────────────────────────────────────────────────────────────
// submitForApproval
// ────────────────────────────────────────────────────────────

/**
 * Resolve the approval chain for a draft document, persist the steps, move the
 * document into `in_approval` (current_step = 1) and notify the first approver(s).
 */
export async function submitForApproval(docType: DocType, docId: string, userId: string): Promise<SubmitResult> {
  const service = await createServiceClient()
  const doc = await fetchDoc(service, docType, docId)
  if (doc.status !== 'draft') throw new ApprovalEngineError('onlyDraftSubmittable')

  // Only the document creator, a procurement feature holder, or an admin may submit
  const submitter = await fetchUser(service, userId)
  const canSubmit =
    submitter !== null &&
    (submitter.role === 'admin' ||
      doc.created_by === userId ||
      holdsFeature(submitter, 'procurement_unit') ||
      holdsFeature(submitter, 'procurement_manage'))
  if (!canSubmit) throw new ApprovalEngineError('submitNotAllowed')

  const flow = APPROVAL_FLOWS[docType]
  const resolved = []
  for (const [i, step] of flow.entries()) {
    const r = await resolveSpec(service, step.approver, doc, userId)
    resolved.push({
      doc_type: docType,
      doc_id: docId,
      step_no: i + 1,
      ...r,
      status: i === 0 ? 'current' : 'pending',
    })
  }

  // Idempotent re-submission of a draft: clear any stale steps first
  await service.from(STEPS_TABLE).delete().eq('doc_type', docType).eq('doc_id', docId)
  const { error: insertError } = await service.from(STEPS_TABLE).insert(resolved)
  if (insertError) throw new Error(`failed to create approval steps: ${insertError.message}`)

  const docUpdate: Record<string, unknown> = { status: 'in_approval', current_step: 1, updated_by: userId }
  if (docType === 'product_evaluation') docUpdate.submitted_by = userId // 送出簽核人
  const { error: updateError } = await service
    .from(DOC_TYPE_META[docType].table)
    .update(docUpdate)
    .eq('id', docId)
  if (updateError) throw new Error(`failed to update document status: ${updateError.message}`)

  await notifyStepApprovers(service, docType, doc, resolved[0])
  return { docNo: doc.doc_no, stepCount: resolved.length }
}

// ────────────────────────────────────────────────────────────
// actOnStep
// ────────────────────────────────────────────────────────────

function canActOnStep(user: UserRow, step: StepRow): boolean {
  if (user.role === 'admin') return true
  if (step.resolved_user_id && step.resolved_user_id === user.id) return true
  switch (step.approver_kind) {
    case 'job_role':
      return user.job_role === step.approver_value
    case 'anyone':
      return !!step.approver_value && holdsFeature(user, step.approver_value)
    case 'manager_of':
      // 請款簽核主管: feature holders may act in place of / alongside the direct manager
      return !!step.approver_value && holdsFeature(user, step.approver_value)
    default:
      return false
  }
}

/**
 * Approve / reject / acknowledge the current step of a document.
 *
 * - `approve` on the last step → document `approved` + post-approval hook
 * - `reject` → document `rejected`, remaining steps `skipped`
 * - `ack` → same as approve but only valid on 'anyone' (notification) steps;
 *   the API route skips the MFA gate for `ack`
 */
export async function actOnStep(
  docType: DocType,
  docId: string,
  userId: string,
  action: ApprovalAction,
  comment?: string | null
): Promise<ActResult> {
  if (action !== 'approve' && action !== 'reject' && action !== 'ack') {
    throw new ApprovalEngineError('invalidAction')
  }

  const service = await createServiceClient()
  const doc = await fetchDoc(service, docType, docId)
  if (doc.status !== 'in_approval' || !doc.current_step) throw new ApprovalEngineError('notInApproval')

  const { data: stepData } = await service
    .from(STEPS_TABLE)
    .select('*')
    .eq('doc_type', docType)
    .eq('doc_id', docId)
    .eq('step_no', doc.current_step)
    .maybeSingle()
  const step = stepData as StepRow | null
  if (!step || step.status !== 'current') throw new ApprovalEngineError('notInApproval')

  const user = await fetchUser(service, userId)
  if (!user || !canActOnStep(user, step)) throw new ApprovalEngineError('notYourTurn')

  if (action === 'ack' && step.approver_kind !== 'anyone') throw new ApprovalEngineError('ackOnlyNotifyStep')
  const effective: 'approve' | 'reject' = action === 'reject' ? 'reject' : 'approve'

  const actedFields = { acted_by: userId, acted_at: new Date().toISOString(), comment: comment ?? null }

  if (effective === 'reject') {
    await service.from(STEPS_TABLE).update({ status: 'rejected', ...actedFields }).eq('id', step.id)
    await service
      .from(STEPS_TABLE)
      .update({ status: 'skipped' })
      .eq('doc_type', docType)
      .eq('doc_id', docId)
      .eq('status', 'pending')
    const { error } = await service
      .from(DOC_TYPE_META[docType].table)
      .update({ status: 'rejected', updated_by: userId })
      .eq('id', docId)
    if (error) throw new Error(`failed to reject document: ${error.message}`)
    await notifyApplicant(service, doc, 'rejected', comment ?? undefined)
    return { docStatus: 'rejected', stepNo: step.step_no, finished: true, hookOk: true }
  }

  // approve / ack
  await service.from(STEPS_TABLE).update({ status: 'approved', ...actedFields }).eq('id', step.id)

  const { data: nextData } = await service
    .from(STEPS_TABLE)
    .select('*')
    .eq('doc_type', docType)
    .eq('doc_id', docId)
    .eq('step_no', step.step_no + 1)
    .maybeSingle()
  const next = nextData as StepRow | null

  if (next) {
    await service.from(STEPS_TABLE).update({ status: 'current' }).eq('id', next.id)
    const { error } = await service
      .from(DOC_TYPE_META[docType].table)
      .update({ current_step: next.step_no, updated_by: userId })
      .eq('id', docId)
    if (error) throw new Error(`failed to advance document: ${error.message}`)
    await notifyStepApprovers(service, docType, doc, next)
    return { docStatus: 'in_approval', stepNo: step.step_no, finished: false, hookOk: true }
  }

  // Last step → fully approved
  const { error } = await service
    .from(DOC_TYPE_META[docType].table)
    .update({ status: 'approved', updated_by: userId })
    .eq('id', docId)
  if (error) throw new Error(`failed to approve document: ${error.message}`)

  let hookOk = true
  try {
    await runPostApprovalHook(service, docType, docId, userId)
  } catch (e) {
    hookOk = false
    console.error(`[procurement] post-approval hook failed for ${docType} ${doc.doc_no}:`, e)
  }

  await notifyApplicant(service, doc, 'approved')
  return { docStatus: 'approved', stepNo: step.step_no, finished: true, hookOk }
}

// ────────────────────────────────────────────────────────────
// post-approval hooks (spec: 簽核通過後自動登錄主檔)
// ────────────────────────────────────────────────────────────

/** Vendor master fields mirrored between vendor_evaluations and vendors */
const VENDOR_MASTER_FIELDS = [
  'name', 'short_name', 'vendor_category', 'country', 'tax_id', 'phone', 'fax',
  'contact_person', 'contact_phone', 'contact_mobile', 'contact_email',
  'accounting_contact', 'accounting_phone', 'accounting_mobile', 'accounting_email',
  'billing_postal_code', 'billing_city_district', 'street_address', 'full_billing_address',
  'payment_method', 'payment_terms', 'closing_day', 'incoterms',
  'bank_name', 'bank_branch', 'bank_swift_code', 'bank_account_no', 'bank_account_name',
  'bankbook_copy_url', 'invoice_seal_url', 'paid_in_capital', 'last_year_revenue',
  'filled_by_id', 'filler_signature_url', 'filling_department',
] as const

async function runPostApprovalHook(service: Service, docType: DocType, docId: string, userId: string): Promise<void> {
  if (docType === 'vendor_evaluation') return registerVendor(service, docId, userId)
  if (docType === 'product_evaluation') return registerVendorProducts(service, docId)
}

/** vendor_evaluation approved → upsert the vendor into the vendors master (登錄廠商清冊) */
async function registerVendor(service: Service, docId: string, userId: string): Promise<void> {
  const { data: ve } = await service.from('vendor_evaluations').select('*').eq('id', docId).maybeSingle()
  if (!ve) throw new Error('vendor evaluation not found')

  const row = ve as Record<string, unknown>
  const payload: Record<string, unknown> = {}
  for (const f of VENDOR_MASTER_FIELDS) {
    if (f in row) payload[f] = row[f]
  }

  if (row.vendor_id) {
    const { error } = await service.from('vendors').update(payload).eq('id', row.vendor_id)
    if (error) throw new Error(`vendor update failed: ${error.message}`)
    return
  }

  // New vendor: generate a vendor_code through the shared counter (V-YYMM-NNN)
  const { data: vendorCode, error: codeError } = await service.rpc('next_doc_no', { p_doc_type: 'vendor', p_prefix: 'V' })
  if (codeError) throw new Error(`vendor_code generation failed: ${codeError.message}`)

  const { data: created, error: insertError } = await service
    .from('vendors')
    .insert({ ...payload, vendor_code: vendorCode })
    .select('id')
    .single()
  if (insertError) throw new Error(`vendor insert failed: ${insertError.message}`)

  await service.from('vendor_evaluations').update({ vendor_id: created.id, updated_by: userId }).eq('id', docId)
}

/**
 * product_evaluation approved → insert evaluated lines into vendor_products
 * (登錄廠商商品價格). Reads child rows from product_evaluation_items; skips
 * gracefully when the items table is absent or empty (items land in Phase B).
 */
async function registerVendorProducts(service: Service, docId: string): Promise<void> {
  const { data: pe } = await service.from('product_evaluations').select('*').eq('id', docId).maybeSingle()
  if (!pe) throw new Error('product evaluation not found')
  const peRow = pe as Record<string, unknown>

  // source RFQ doc_no for traceability (vendor_products.source_rfq_no)
  let sourceRfqNo: string | null = null
  if (peRow.rfq_id) {
    const { data: rfq } = await service.from('rfqs').select('doc_no').eq('id', peRow.rfq_id).maybeSingle()
    sourceRfqNo = (rfq?.doc_no as string | undefined) ?? null
  }

  const { data: items, error: itemsError } = await service
    .from('product_evaluation_items')
    .select('*')
    .eq('pe_id', docId)
  if (itemsError) {
    console.warn(`[procurement] product_evaluation_items unavailable (${itemsError.message}) — skipping vendor_products registration`)
    return
  }
  if (!items || items.length === 0) return

  const VENDOR_PRODUCT_FIELDS = [
    'product_id', 'vendor_id', 'product_code', 'product_name', 'spec', 'unit',
    'vendor_code', 'vendor_name', 'purchase_code', 'unit_price', 'quote_date', 'filled_date',
  ] as const

  const rows = (items as Record<string, unknown>[]).map(item => {
    const out: Record<string, unknown> = { source_rfq_no: sourceRfqNo }
    for (const f of VENDOR_PRODUCT_FIELDS) {
      if (f in item) out[f] = item[f]
    }
    return out
  })

  const { error } = await service.from('vendor_products').insert(rows)
  if (error) throw new Error(`vendor_products insert failed: ${error.message}`)
}
