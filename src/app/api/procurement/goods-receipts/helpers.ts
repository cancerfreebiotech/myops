// Shared helpers for the goods receipt (進貨驗收單) API routes
// (/api/procurement/goods-receipts and [id]).
// Not a route file — only route.ts files export HTTP handlers.

import { userHasFeature } from '@/lib/job-role-features'
import type { ProcurementUser } from '@/app/api/procurement/evaluations/helpers'

/** Writable text columns ('' → null) */
export const GR_TEXT_FIELDS = [
  'requesting_department',
  'vendor_code',
  'vendor_name',
  'tax_id',
  'contact_person',
  'phone',
  'fax',
  'email',
  'tax_type',
  'deposit_doc_no',
  'invoice_no',
  'invoice_doc_url',
  'shipping_doc_url',
  'notes',
] as const

/** Writable numeric columns (number or numeric string; '' → null) */
export const GR_NUMERIC_FIELDS = [
  'tax_rate',
  'tax_amount',
  'subtotal',
  'shipping_fee',
  'total_amount',
  'deposit_paid_amount',
] as const

/** Writable DATE columns (YYYY-MM-DD; '' → null) */
export const GR_DATE_FIELDS = ['invoice_date'] as const

/** Writable TIMESTAMPTZ columns (ISO string; '' → null) */
export const GR_TIMESTAMP_FIELDS = ['received_at', 'inspected_at', 'confirmed_inbound_at'] as const

/** Writable boolean columns */
export const GR_BOOLEAN_FIELDS = ['has_deposit', 'converted_to_inspection'] as const

export type GrFieldsResult =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; invalidField: string }

/**
 * Whitelist + coerce goods-receipt columns from a request body.
 * Absent keys are skipped; '' and null become NULL; bad numbers / dates /
 * booleans report the offending field.
 */
export function pickGoodsReceiptFields(body: Record<string, unknown>): GrFieldsResult {
  const fields: Record<string, unknown> = {}

  for (const f of GR_TEXT_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    if (v === null || v === '') fields[f] = null
    else if (typeof v === 'string') fields[f] = v.trim() || null
    else return { ok: false, invalidField: f }
  }

  for (const f of GR_NUMERIC_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    if (v === null || v === '') { fields[f] = null; continue }
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN
    if (!Number.isFinite(n)) return { ok: false, invalidField: f }
    fields[f] = n
  }

  for (const f of [...GR_DATE_FIELDS, ...GR_TIMESTAMP_FIELDS]) {
    if (!(f in body)) continue
    const v = body[f]
    if (v === null || v === '') { fields[f] = null; continue }
    if (typeof v !== 'string' || Number.isNaN(new Date(v).getTime())) {
      return { ok: false, invalidField: f }
    }
    fields[f] = v
  }

  for (const f of GR_BOOLEAN_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    if (typeof v !== 'boolean') return { ok: false, invalidField: f }
    fields[f] = v
  }

  return { ok: true, fields }
}

/**
 * Spec rule 1 (進貨驗收單): 廠商編號 is read-only for users holding neither
 * procurement_unit nor procurement_manage (admin always passes).
 */
export function canEditVendorCode(user: ProcurementUser): boolean {
  return (
    userHasFeature(user.role, user.job_role, user.granted_features, 'procurement_unit') ||
    userHasFeature(user.role, user.job_role, user.granted_features, 'procurement_manage')
  )
}

/** List/detail select with PR + creator joins */
export const GR_LIST_SELECT =
  'id, doc_no, status, current_step, pr_id, vendor_name, total_amount, has_deposit, created_at, created_by, ' +
  'pr:purchase_requests(id, doc_no), created_by_user:users!goods_receipts_created_by_fkey(id, display_name)'
