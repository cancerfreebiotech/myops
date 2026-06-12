// Shared helpers for the payment-request API routes
// (/api/procurement/payments/[kind] and [kind]/[id] + upload/file).
// Not a route file — only route.ts files export HTTP handlers.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/job-role-features'
import type { DocType } from '@/lib/procurement/doc-types'

/** The three payment documents (請款三單): 訂金 / 採購 / 分期 */
export type PaymentKind = 'deposit' | 'ap' | 'installment'

export const PAYMENT_DOC_TYPE: Record<PaymentKind, DocType> = {
  deposit: 'deposit_request',
  ap: 'ap_request',
  installment: 'installment_request',
}

export const PAYMENT_TABLE: Record<PaymentKind, string> = {
  deposit: 'deposit_requests',
  ap: 'ap_requests',
  installment: 'installment_requests',
}

export function isPaymentKind(value: string): value is PaymentKind {
  return value === 'deposit' || value === 'ap' || value === 'installment'
}

// ────────────────────────────────────────────────────────────
// editable field whitelists (column → primitive type)
// ────────────────────────────────────────────────────────────

type FieldType = 'string' | 'number' | 'boolean' | 'date'

const DEPOSIT_FIELDS: Record<string, FieldType> = {
  deposit_amount: 'number',       // 訂金金額
  total_amount: 'number',         // 合計金額
  remittance_deadline: 'date',    // 要求匯款期限
  remittance_date: 'date',        // 匯款日期
  remittance_month: 'string',     // 匯款月份
  closing_day: 'string',          // 結帳日
  bank_name: 'string',
  bank_branch: 'string',
  bank_swift_code: 'string',
  bank_account_no: 'string',
  bank_account_name: 'string',
  notes: 'string',
}

const AP_FIELDS: Record<string, FieldType> = {
  billing_month: 'string',        // 請款月份
  ap_total_amount: 'number',      // 採購請款總金額
  amount_adjustment: 'number',    // 金額調整
  adjustment_notes: 'string',     // 調整備註
  total_amount: 'number',         // 合計金額
  is_installment: 'boolean',      // 是否分期
  payment_method: 'string',
  payment_terms: 'string',
  closing_day: 'string',
  remittance_deadline: 'date',
  bank_name: 'string',
  bank_branch: 'string',
  bank_swift_code: 'string',
  bank_account_no: 'string',
  bank_account_name: 'string',
  tax_id: 'string',
  country: 'string',
  notes: 'string',
}

// installment_no is system-assigned (count of non-voided installments + 1)
// and doc_no comes from the trigger — neither is user-editable (spec §三-10).
const INSTALLMENT_FIELDS: Record<string, FieldType> = {
  billing_month: 'string',        // 請款月份
  amount: 'number',               // 金額
  invoice_no: 'string',           // 發票號碼
  invoice_date: 'date',           // 發票日期
  invoice_file_url: 'string',     // 發票檔案 (storage path in the procurement bucket)
  notes: 'string',
}

export const PAYMENT_FIELDS: Record<PaymentKind, Record<string, FieldType>> = {
  deposit: DEPOSIT_FIELDS,
  ap: AP_FIELDS,
  installment: INSTALLMENT_FIELDS,
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Pick whitelisted fields from a request body, coercing by declared type.
 * '' / null clear the column; values of the wrong shape are ignored.
 */
export function pickPaymentFields(body: Record<string, unknown>, kind: PaymentKind): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [field, type] of Object.entries(PAYMENT_FIELDS[kind])) {
    if (!(field in body)) continue
    const v = body[field]
    if (v === null || v === '') { out[field] = null; continue }
    switch (type) {
      case 'string':
        if (typeof v === 'string') out[field] = v.trim() || null
        break
      case 'number': {
        const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
        if (Number.isFinite(n)) out[field] = n
        break
      }
      case 'boolean':
        if (typeof v === 'boolean') out[field] = v
        break
      case 'date':
        if (typeof v === 'string' && DATE_RE.test(v)) out[field] = v
        break
    }
  }
  return out
}

// ────────────────────────────────────────────────────────────
// vendor master completion (從廠商主檔帶入 — mirrors conversions.ts)
// ────────────────────────────────────────────────────────────

/** target column ← vendors column, per payment kind (deposit/ap carry vendor bank info) */
const VENDOR_FILL: Partial<Record<PaymentKind, Record<string, string>>> = {
  deposit: {
    vendor_code: 'vendor_code',
    vendor_name: 'name',
    vendor_short_name: 'short_name',
    closing_day: 'closing_day',
    bank_name: 'bank_name',
    bank_branch: 'bank_branch',
    bank_swift_code: 'bank_swift_code',
    bank_account_no: 'bank_account_no',
    bank_account_name: 'bank_account_name',
  },
  ap: {
    vendor_code: 'vendor_code',
    vendor_name: 'name',
    country: 'country',
    tax_id: 'tax_id',
    payment_method: 'payment_method',
    payment_terms: 'payment_terms',
    closing_day: 'closing_day',
    bank_name: 'bank_name',
    bank_branch: 'bank_branch',
    bank_swift_code: 'bank_swift_code',
    bank_account_no: 'bank_account_no',
    bank_account_name: 'bank_account_name',
  },
}

type Service = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Complete a deposit/ap payload from the vendors master. Identity columns
 * (vendor_code / vendor_name / short_name) are always overwritten; the bank
 * and payment columns only when the caller did not provide them explicitly.
 * Returns false when the vendor does not exist.
 */
export async function applyVendorInfo(
  service: Service,
  kind: PaymentKind,
  vendorId: string,
  payload: Record<string, unknown>,
  explicitKeys: Set<string>
): Promise<boolean> {
  const map = VENDOR_FILL[kind]
  if (!map) return true
  const { data: vendor } = await service.from('vendors').select('*').eq('id', vendorId).maybeSingle()
  if (!vendor) return false
  const v = vendor as Record<string, unknown>
  const identity = new Set(['vendor_code', 'vendor_name', 'vendor_short_name'])
  for (const [targetCol, vendorCol] of Object.entries(map)) {
    if (identity.has(targetCol) || !explicitKeys.has(targetCol)) {
      payload[targetCol] = v[vendorCol] ?? null
    }
  }
  payload.vendor_id = vendorId
  return true
}

// ────────────────────────────────────────────────────────────
// auth + step authorization (same gates as the evaluations routes)
// ────────────────────────────────────────────────────────────

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

export interface StepRow {
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
export function canActOnStep(user: ProcurementUser, step: StepRow): boolean {
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
