// Shared helpers for the inventory document API routes
// (/api/procurement/inbound, /api/procurement/outbound,
//  /api/procurement/stock-lookup).
// Not a route file — only route.ts files export HTTP handlers.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/job-role-features'

export interface InventoryUser {
  id: string
  role: string
  job_role: string
  granted_features: string[]
  /** procurement_manage | admin — may edit/delete other users' drafts */
  canManage: boolean
}

export type AuthResult =
  | { status: 'ok'; user: InventoryUser }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }

/** auth + procurement feature gate (procurement_unit / procurement_manage / admin) */
export async function requireInventoryUser(): Promise<AuthResult> {
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

  const granted = (row.granted_features as string[] | null) ?? []
  const canRead =
    userHasFeature(row.role, row.job_role, granted, 'procurement_unit') ||
    userHasFeature(row.role, row.job_role, granted, 'procurement_manage')
  if (!canRead) return { status: 'forbidden' }

  return {
    status: 'ok',
    user: {
      id: row.id,
      role: row.role,
      job_role: row.job_role,
      granted_features: granted,
      canManage: userHasFeature(row.role, row.job_role, granted, 'procurement_manage'),
    },
  }
}

// ── approval step display (mirrors the evaluations detail route) ──

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
export function canActOnStep(user: InventoryUser, step: StepRow): boolean {
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

/** Load + enrich the approval steps of a document, and resolve display names. */
export async function loadApprovalContext(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  docType: 'inbound_order' | 'outbound_order',
  docId: string,
  doc: Record<string, unknown>,
  me: InventoryUser,
) {
  const { data: stepsData, error } = await service
    .from('procurement_approval_steps')
    .select('id, step_no, approver_kind, approver_value, resolved_user_id, status, acted_by, acted_at, comment')
    .eq('doc_type', docType)
    .eq('doc_id', docId)
    .order('step_no', { ascending: true })
  if (error) throw error
  const steps = (stepsData ?? []) as StepRow[]

  const userIds = new Set<string>()
  for (const key of ['created_by', 'updated_by', 'voided_by'] as const) {
    const v = doc[key]
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

  const currentStep = doc.status === 'in_approval' && doc.current_step
    ? steps.find(s => s.step_no === doc.current_step && s.status === 'current') ?? null
    : null

  return {
    steps: enrichedSteps,
    can_act: !!currentStep && canActOnStep(me, currentStep),
    current_step_kind: currentStep?.approver_kind ?? null,
    created_by_name: typeof doc.created_by === 'string' ? names[doc.created_by] ?? null : null,
  }
}

// ── body parsing ──

export function asTrimmedString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function asPositiveNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

// ── inbound items ──

export interface InboundItemInput {
  product_id: string
  warehouse_id: string
  lot_no: string | null
  expiry_date: string | null
  quantity: number
  notes: string | null
}

/** Validate the items array of an inbound order body. Returns null on any invalid line. */
export function parseInboundItems(raw: unknown): InboundItemInput[] | null {
  if (!Array.isArray(raw)) return null
  const items: InboundItemInput[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null
    const e = entry as Record<string, unknown>
    const product_id = asTrimmedString(e.product_id)
    const warehouse_id = asTrimmedString(e.warehouse_id)
    const quantity = asPositiveNumber(e.quantity)
    if (!product_id || !warehouse_id || quantity === null) return null
    items.push({
      product_id,
      warehouse_id,
      lot_no: asTrimmedString(e.lot_no),
      expiry_date: asTrimmedString(e.expiry_date),
      quantity,
      notes: asTrimmedString(e.notes),
    })
  }
  return items
}

interface ProductSnapshot {
  id: string
  product_code: string | null
  name: string | null
  spec: string | null
  stock_unit: string | null
}

/**
 * Build inbound_items insert rows: snapshot product columns and decide per line
 * whether the (product, warehouse, lot) already exists in warehouse_stock
 * (批號自動判斷 — plan decision 8). Returns the rows plus whether any line
 * creates a new lot (drives inbound_orders.is_new_lot).
 */
export async function buildInboundItemRows(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  orderId: string,
  items: InboundItemInput[],
): Promise<{ rows: Record<string, unknown>[]; hasNewLot: boolean } | { missingProduct: true }> {
  const productIds = Array.from(new Set(items.map(i => i.product_id)))
  const { data: products } = await service
    .from('products')
    .select('id, product_code, name, spec, stock_unit')
    .in('id', productIds)
  const productMap = new Map<string, ProductSnapshot>()
  for (const p of (products ?? []) as ProductSnapshot[]) productMap.set(p.id, p)
  if (productIds.some(id => !productMap.has(id))) return { missingProduct: true }

  let hasNewLot = false
  const rows: Record<string, unknown>[] = []
  for (const [index, item] of items.entries()) {
    const product = productMap.get(item.product_id)!

    let query = service
      .from('warehouse_stock')
      .select('id')
      .eq('product_id', item.product_id)
      .eq('warehouse_id', item.warehouse_id)
    query = item.lot_no === null ? query.is('lot_no', null) : query.eq('lot_no', item.lot_no)
    const { data: existing } = await query.limit(1).maybeSingle()
    if (!existing) hasNewLot = true

    rows.push({
      inbound_order_id: orderId,
      line_no: index + 1,
      product_id: item.product_id,
      product_code: product.product_code,
      product_name: product.name,
      spec: product.spec,
      unit: product.stock_unit,
      warehouse_id: item.warehouse_id,
      lot_no: item.lot_no,
      expiry_date: item.expiry_date,
      quantity: item.quantity,
      notes: item.notes,
    })
  }
  return { rows, hasNewLot }
}

// ── outbound items ──

export interface OutboundItemInput {
  warehouse_stock_id: string | null
  stock_code: string | null
  used_qty: number
  notes: string | null
}

/** Validate the items array of an outbound order body (each line needs a stock ref + qty). */
export function parseOutboundItems(raw: unknown): OutboundItemInput[] | null {
  if (!Array.isArray(raw)) return null
  const items: OutboundItemInput[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null
    const e = entry as Record<string, unknown>
    const warehouse_stock_id = asTrimmedString(e.warehouse_stock_id)
    const stock_code = asTrimmedString(e.stock_code)
    const used_qty = asPositiveNumber(e.used_qty)
    if ((!warehouse_stock_id && !stock_code) || used_qty === null) return null
    items.push({ warehouse_stock_id, stock_code, used_qty, notes: asTrimmedString(e.notes) })
  }
  return items
}

interface StockSnapshot {
  id: string
  stock_code: string | null
  product_id: string
  product_code: string | null
  product_name: string | null
  spec: string | null
  unit: string | null
  quantity: number
}

/** Build outbound_items insert rows, snapshotting product columns from the referenced stock rows. */
export async function buildOutboundItemRows(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  orderId: string,
  items: OutboundItemInput[],
): Promise<{ rows: Record<string, unknown>[] } | { missingStock: true }> {
  const ids = Array.from(new Set(items.map(i => i.warehouse_stock_id).filter((v): v is string => !!v)))
  const codes = Array.from(new Set(items.filter(i => !i.warehouse_stock_id).map(i => i.stock_code).filter((v): v is string => !!v)))

  const stockById = new Map<string, StockSnapshot>()
  const stockByCode = new Map<string, StockSnapshot>()
  if (ids.length > 0) {
    const { data } = await service
      .from('warehouse_stock')
      .select('id, stock_code, product_id, product_code, product_name, spec, unit, quantity')
      .in('id', ids)
    for (const s of (data ?? []) as StockSnapshot[]) stockById.set(s.id, s)
  }
  if (codes.length > 0) {
    const { data } = await service
      .from('warehouse_stock')
      .select('id, stock_code, product_id, product_code, product_name, spec, unit, quantity')
      .in('stock_code', codes)
    for (const s of (data ?? []) as StockSnapshot[]) {
      if (s.stock_code) stockByCode.set(s.stock_code, s)
    }
  }

  const rows: Record<string, unknown>[] = []
  for (const [index, item] of items.entries()) {
    const stock = item.warehouse_stock_id
      ? stockById.get(item.warehouse_stock_id)
      : item.stock_code
        ? stockByCode.get(item.stock_code)
        : undefined
    if (!stock) return { missingStock: true }
    rows.push({
      outbound_order_id: orderId,
      line_no: index + 1,
      product_id: stock.product_id,
      product_code: stock.product_code,
      product_name: stock.product_name,
      spec: stock.spec,
      unit: stock.unit,
      warehouse_stock_id: stock.id,
      stock_code: stock.stock_code,
      used_qty: item.used_qty,
      notes: item.notes,
    })
  }
  return { rows }
}

// ── posting RPC error mapping ──

/** Supabase rpc errors carry the Postgres SQLSTATE in error.code (P0002…P0005). */
export function rpcErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return null
}
