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

/**
 * rfq_items（請購商品）/ rfq_quotes（逐項多廠商報價）可由 API 寫入的欄位。
 * schema: supabase/migrations/20260727000001_rfq_items_quotes.sql
 * 欄位名與 field-locks.ts 的 RFQ_ITEM_LOCKED_FIELDS_IN_APPROVAL 對齊（跨兩張表）。
 */
const ITEM_NUM_FIELDS = ['line_no', 'quantity'] as const
const ITEM_TEXT_FIELDS = ['product_code', 'product_name', 'spec', 'unit', 'usage_notes', 'notes'] as const
const ITEM_UUID_FIELDS = ['product_id', 'suggested_vendor_id'] as const

const QUOTE_NUM_FIELDS = ['unit_price'] as const
const QUOTE_TEXT_FIELDS = ['vendor_name', 'vendor_product_code', 'vendor_product_name', 'unit', 'notes'] as const
const QUOTE_UUID_FIELDS = ['vendor_id'] as const
const QUOTE_DATE_FIELDS = ['quote_date'] as const

type Row = Record<string, unknown>

/** 依白名單挑欄位並正規化；'' / null → null。回傳 null 代表值格式錯誤。 */
function pickRow(
  raw: Row,
  spec: { text: readonly string[]; num: readonly string[]; uuid: readonly string[]; date?: readonly string[] },
): Row | null {
  const out: Row = {}
  // 既有列帶 id（merge 模式據以更新），新列無 id
  if (typeof raw.id === 'string' && UUID_RE.test(raw.id)) out.id = raw.id
  for (const f of spec.text) {
    if (!(f in raw)) continue
    const v = raw[f]
    if (v === null || v === '') out[f] = null
    else if (typeof v === 'string') out[f] = v.trim() || null
    else return null
  }
  for (const f of spec.num) {
    if (!(f in raw)) continue
    const v = raw[f]
    if (v === null || v === '') out[f] = null
    else if (typeof v === 'number' && Number.isFinite(v)) out[f] = v
    else if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) out[f] = Number(v)
    else return null
  }
  for (const f of spec.uuid) {
    if (!(f in raw)) continue
    const v = raw[f]
    if (v === null || v === '') out[f] = null
    else if (typeof v === 'string' && UUID_RE.test(v.trim())) out[f] = v.trim()
    else return null
  }
  for (const f of spec.date ?? []) {
    if (!(f in raw)) continue
    const v = raw[f]
    if (v === null || v === '') out[f] = null
    else if (typeof v === 'string' && DATE_RE.test(v.trim())) out[f] = v.trim()
    else return null
  }
  return out
}

/** 白名單化 rfq_items 陣列；omit 為簽核中鎖定、需剔除的欄位。 */
export function pickRfqItems(
  raw: unknown,
  omit: readonly string[] = [],
): { items: Row[]; invalid?: true } {
  if (!Array.isArray(raw)) return { items: [], invalid: true }
  const items: Row[] = []
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) return { items: [], invalid: true }
    const row = pickRow(r as Row, { text: ITEM_TEXT_FIELDS, num: ITEM_NUM_FIELDS, uuid: ITEM_UUID_FIELDS })
    if (!row) return { items: [], invalid: true }
    for (const f of omit) if (f !== 'id') delete row[f]
    items.push(row)
  }
  return { items }
}

/** 白名單化某品項底下的 rfq_quotes 陣列（is_selected 為布林，單獨處理）。 */
export function pickRfqQuotes(
  raw: unknown,
  omit: readonly string[] = [],
): { quotes: Row[]; invalid?: true } {
  if (!Array.isArray(raw)) return { quotes: [], invalid: true }
  const quotes: Row[] = []
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) return { quotes: [], invalid: true }
    const src = r as Row
    const row = pickRow(src, {
      text: QUOTE_TEXT_FIELDS, num: QUOTE_NUM_FIELDS, uuid: QUOTE_UUID_FIELDS, date: QUOTE_DATE_FIELDS,
    })
    if (!row) return { quotes: [], invalid: true }
    if ('is_selected' in src) {
      if (typeof src.is_selected !== 'boolean') return { quotes: [], invalid: true }
      row.is_selected = src.is_selected
    }
    for (const f of omit) if (f !== 'id') delete row[f]
    quotes.push(row)
  }
  // 一個品項至多一筆採用（DB 未加唯一索引，於此把關）
  if (quotes.filter(q => q.is_selected === true).length > 1) return { quotes: [], invalid: true }
  return { quotes }
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
