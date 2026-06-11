import { userHasFeature } from '@/lib/job-role-features'

// Writable columns of the vendors master table (採購_廠商清冊, 37 business fields).
// Shared by the list (POST) and detail (PUT) routes — anything not in this list
// (id, created_by/at, updated_by/at, deleted_at) is server-managed.
export const VENDOR_FIELDS = [
  // 基本
  'vendor_code',
  'name',
  'short_name',
  'vendor_category',
  'country',
  'tax_id',
  'paid_in_capital',
  'last_year_revenue',
  'filling_department',
  'filled_by_id',
  'filler_signature_url',
  'notes',
  // 聯絡
  'phone',
  'fax',
  'contact_person',
  'contact_phone',
  'contact_mobile',
  'contact_email',
  // 帳務
  'accounting_contact',
  'accounting_phone',
  'accounting_mobile',
  'accounting_email',
  'billing_postal_code',
  'billing_city_district',
  'street_address',
  'full_billing_address',
  'payment_method',
  'payment_terms',
  'closing_day',
  'incoterms',
  // 銀行
  'bank_name',
  'bank_branch',
  'bank_swift_code',
  'bank_account_no',
  'bank_account_name',
  'bankbook_copy_url',
  'invoice_seal_url',
] as const

export type VendorField = typeof VENDOR_FIELDS[number]

export const VENDOR_SELECT = '*, filled_by:users!vendors_filled_by_id_fkey(display_name)'

interface UserAccess {
  role: string | null
  job_role: string | null
  granted_features: string[] | null
}

export function canReadVendors(u: UserAccess | null): boolean {
  if (!u) return false
  return (
    userHasFeature(u.role ?? '', u.job_role ?? '', u.granted_features ?? [], 'procurement_unit') ||
    userHasFeature(u.role ?? '', u.job_role ?? '', u.granted_features ?? [], 'procurement_manage')
  )
}

export function canWriteVendors(u: UserAccess | null): boolean {
  if (!u) return false
  return userHasFeature(u.role ?? '', u.job_role ?? '', u.granted_features ?? [], 'procurement_manage')
}

/** Picks writable fields from a request body; empty strings become NULL. */
export function pickVendorFields(body: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const f of VENDOR_FIELDS) {
    if (f in body) {
      const v = body[f]
      row[f] = typeof v === 'string' && v.trim() === '' ? null : v
    }
  }
  return row
}
