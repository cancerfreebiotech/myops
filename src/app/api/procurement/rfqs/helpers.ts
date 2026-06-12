// Shared helpers for the RFQ (詢價單) API routes
// (/api/procurement/rfqs and /api/procurement/rfqs/[id]).
// Not a route file — only route.ts files export HTTP handlers.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/job-role-features'

/**
 * rfqs header columns writable through the API (schema:
 * supabase/migrations/20260612000010_procurement_docs.sql). System-managed
 * columns (doc_no, status, current_step, pr_count, product_eval_count,
 * voided_*) are never client-writable.
 */
export const RFQ_TEXT_FIELDS = [
  'requesting_department',
  'department',
  'request_notes',
  'review_notes',
  'urgency',
  'notes',
] as const

export const RFQ_DATE_FIELDS = [
  'request_date',
  'review_date',
  'expected_delivery_date',
] as const

export const RFQ_USER_FIELDS = [
  'requester_id',
  'inquirer_id',
  'reviewer_id',
] as const

export const RFQ_WRITABLE_FIELDS = [
  ...RFQ_TEXT_FIELDS,
  ...RFQ_DATE_FIELDS,
  ...RFQ_USER_FIELDS,
] as const

/** List/detail select with display names for the user reference columns */
export const RFQ_LIST_SELECT =
  'id, doc_no, status, current_step, request_date, requesting_department, department, urgency, expected_delivery_date, pr_count, created_at, created_by, ' +
  'requester:users!rfqs_requester_id_fkey(id, display_name), ' +
  'inquirer:users!rfqs_inquirer_id_fkey(id, display_name), ' +
  'created_by_user:users!rfqs_created_by_fkey(id, display_name)'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whitelist + normalize rfq fields from a request body.
 * '' / null → null; dates must be YYYY-MM-DD; user refs must be UUIDs.
 * Returns { error: field } on a malformed value.
 */
export function pickRfqFields(
  body: Record<string, unknown>
): { fields: Record<string, string | null>; invalid?: string } {
  const fields: Record<string, string | null> = {}
  for (const f of RFQ_TEXT_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    if (v === null || v === '') fields[f] = null
    else if (typeof v === 'string') fields[f] = v.trim() || null
    else return { fields, invalid: f }
  }
  for (const f of RFQ_DATE_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    if (v === null || v === '') fields[f] = null
    else if (typeof v === 'string' && DATE_RE.test(v.trim())) fields[f] = v.trim()
    else return { fields, invalid: f }
  }
  for (const f of RFQ_USER_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    if (v === null || v === '') fields[f] = null
    else if (typeof v === 'string' && UUID_RE.test(v.trim())) fields[f] = v.trim()
    else return { fields, invalid: f }
  }
  return { fields }
}

export interface ProcurementUser {
  id: string
  role: string
  job_role: string
  granted_features: string[]
}

export type AuthResult =
  | { status: 'ok'; user: ProcurementUser }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }

/** auth + procurement feature gate (procurement_unit / procurement_manage / admin) */
export async function requireProcurementUser(): Promise<AuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'unauthorized' }

  const service = await createServiceClient()
  const { data: row } = await service
    .from('users')
    .select('id, role, job_role, granted_features')
    .eq('id', user.id)
    .single()
  if (!row) return { status: 'unauthorized' }

  const u: ProcurementUser = {
    id: row.id,
    role: row.role,
    job_role: row.job_role,
    granted_features: (row.granted_features as string[] | null) ?? [],
  }
  const ok =
    userHasFeature(u.role, u.job_role, u.granted_features, 'procurement_unit') ||
    userHasFeature(u.role, u.job_role, u.granted_features, 'procurement_manage')
  return ok ? { status: 'ok', user: u } : { status: 'forbidden' }
}
