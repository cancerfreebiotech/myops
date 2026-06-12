// Shared helpers for the purchase request (請採購單) API routes
// (/api/procurement/purchase-requests and /[id]).
// Not a route file — only route.ts files export HTTP handlers.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/job-role-features'

// ────────────────────────────────────────────────────────────
// auth
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

// ────────────────────────────────────────────────────────────
// header field whitelists (purchase_requests — schema 20260612000010)
// ────────────────────────────────────────────────────────────

export const PR_TEXT_FIELDS = [
  'requesting_department', 'urgency', 'fulfillment_status',
  'vendor_code', 'vendor_name', 'tax_id', 'contact_person',
  'phone', 'fax', 'email', 'address', 'delivery_address',
  'payment_method', 'payment_terms', 'incoterms', 'tax_type',
  'notes',
] as const

export const PR_DATE_FIELDS = [
  'purchase_date', 'request_expected_date', 'required_delivery_date',
  'expected_delivery_date', 'closed_date',
] as const

export const PR_NUMERIC_FIELDS = [
  'tax_rate', 'tax_amount', 'subtotal', 'shipping_fee', 'total_amount',
] as const

export const PR_UUID_FIELDS = ['purchaser_id', 'vendor_id', 'rfq_id'] as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function asNumber(v: unknown): number | null | undefined {
  if (v === null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined // invalid → ignore
}

/** Whitelist + normalize header fields from a request body ('' → null, invalid values ignored). */
export function pickHeaderFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of PR_TEXT_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    if (v === null || v === '') out[f] = null
    else if (typeof v === 'string') out[f] = v.trim() || null
  }
  for (const f of PR_DATE_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    if (v === null || v === '') out[f] = null
    else if (typeof v === 'string' && DATE_RE.test(v.trim())) out[f] = v.trim()
  }
  for (const f of PR_NUMERIC_FIELDS) {
    if (!(f in body)) continue
    const n = asNumber(body[f])
    if (n !== undefined) out[f] = n
  }
  for (const f of PR_UUID_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    if (v === null || v === '') out[f] = null
    else if (typeof v === 'string' && UUID_RE.test(v.trim())) out[f] = v.trim()
  }
  return out
}

// ────────────────────────────────────────────────────────────
// line items (pr_items — unit/price in 採購單位)
// ────────────────────────────────────────────────────────────

const ITEM_TEXT_FIELDS = ['product_code', 'product_name', 'spec', 'unit', 'purchase_code'] as const

export interface NormalizedItem {
  id: string | null
  line_no: number
  product_id: string | null
  product_code: string | null
  product_name: string | null
  spec: string | null
  unit: string | null
  purchase_code: string | null
  unit_price: number | null
  quantity: number | null
  /** 金額 — always recomputed server-side: round(unit_price × quantity) */
  amount: number | null
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Normalize the `items` payload for the batch upsert. Returns null when the
 * payload is not an array of objects (caller responds 400 invalidItems).
 * line_no is renumbered sequentially server-side.
 */
export function normalizeItems(raw: unknown): NormalizedItem[] | null {
  if (!Array.isArray(raw)) return null
  const items: NormalizedItem[] = []
  for (const [i, entry] of raw.entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null
    const row = entry as Record<string, unknown>

    const id = typeof row.id === 'string' && UUID_RE.test(row.id) ? row.id : null
    const productId = typeof row.product_id === 'string' && UUID_RE.test(row.product_id) ? row.product_id : null

    const texts: Record<string, string | null> = {}
    for (const f of ITEM_TEXT_FIELDS) {
      const v = row[f]
      texts[f] = typeof v === 'string' ? v.trim() || null : null
    }

    const unitPrice = asNumber(row.unit_price) ?? null
    const quantity = asNumber(row.quantity) ?? null
    const amount = unitPrice !== null && quantity !== null ? round2(unitPrice * quantity) : null

    items.push({
      id,
      line_no: i + 1,
      product_id: productId,
      product_code: texts.product_code,
      product_name: texts.product_name,
      spec: texts.spec,
      unit: texts.unit,
      purchase_code: texts.purchase_code,
      unit_price: unitPrice,
      quantity,
      amount,
    })
  }
  return items
}

/**
 * Recompute the money columns from the (normalized) items + header values:
 * subtotal = Σ amount, tax_amount = round(subtotal × tax_rate/100),
 * total_amount = subtotal + tax_amount + shipping_fee.
 */
export function computeTotals(
  items: NormalizedItem[],
  taxRate: number | null,
  shippingFee: number | null
): { subtotal: number; tax_amount: number; total_amount: number } {
  const subtotal = round2(items.reduce((sum, it) => sum + (it.amount ?? 0), 0))
  const tax_amount = round2(subtotal * ((taxRate ?? 0) / 100))
  const total_amount = round2(subtotal + tax_amount + (shippingFee ?? 0))
  return { subtotal, tax_amount, total_amount }
}

/** Columns returned by the list endpoints */
export const PR_LIST_SELECT =
  'id, doc_no, status, current_step, vendor_name, total_amount, purchase_date, urgency, fulfillment_status, ' +
  'gr_count, deposit_request_count, created_at, created_by, ' +
  'purchaser:users!purchase_requests_purchaser_id_fkey(id, display_name), ' +
  'created_by_user:users!purchase_requests_created_by_fkey(id, display_name)'
