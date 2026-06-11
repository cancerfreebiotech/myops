// Shared helpers for the evaluation document API routes
// (/api/procurement/evaluations/[type] and [type]/[id]).
// Not a route file — only route.ts files export HTTP handlers.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/job-role-features'
import type { DocType } from '@/lib/procurement/doc-types'

export type EvalType = 'vendor' | 'product'

export const EVAL_DOC_TYPE: Record<EvalType, DocType> = {
  vendor: 'vendor_evaluation',
  product: 'product_evaluation',
}

export const EVAL_TABLE: Record<EvalType, string> = {
  vendor: 'vendor_evaluations',
  product: 'product_evaluations',
}

/** Vendor-master field set editable on a vendor evaluation (file uploads land in Phase B) */
export const VENDOR_EVAL_FIELDS = [
  'name', 'short_name', 'vendor_category', 'country', 'tax_id', 'phone', 'fax',
  'contact_person', 'contact_phone', 'contact_mobile', 'contact_email',
  'accounting_contact', 'accounting_phone', 'accounting_mobile', 'accounting_email',
  'billing_postal_code', 'billing_city_district', 'street_address', 'full_billing_address',
  'payment_method', 'payment_terms', 'closing_day', 'incoterms',
  'bank_name', 'bank_branch', 'bank_swift_code', 'bank_account_no', 'bank_account_name',
  'paid_in_capital', 'last_year_revenue', 'filling_department', 'notes',
] as const

export function isEvalType(value: string): value is EvalType {
  return value === 'vendor' || value === 'product'
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

/** Pick whitelisted string fields from a request body ('' → null, others ignored) */
export function pickStringFields(
  body: Record<string, unknown>,
  fields: readonly string[]
): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const f of fields) {
    if (!(f in body)) continue
    const v = body[f]
    if (v === null || v === '') out[f] = null
    else if (typeof v === 'string') out[f] = v.trim() || null
  }
  return out
}
