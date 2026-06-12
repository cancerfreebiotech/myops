// Client-safe shared types for the procurement inventory page
// (入庫單 / 出庫單 / 庫存查詢 + 掃描模式).

import type { DocStatus } from '@/lib/procurement/doc-types'
import type { TimelineStep } from '@/components/procurement/ApprovalTimeline'

export type Direction = 'inbound' | 'outbound'

export interface NamedRef {
  id: string
  display_name: string | null
}

export type MaybeArray<T> = T | T[] | null

export function one<T>(v: MaybeArray<T> | undefined): T | null {
  if (v === undefined) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export interface WarehouseOption {
  id: string
  code: string
  name: string
}

export interface ProductOption {
  id: string
  product_code: string | null
  name: string
  spec: string | null
  item_code: string | null
  purchase_unit: string | null
  stock_unit: string | null
  units_per_purchase: number | null
  current_stock_qty: number | null
}

export interface StockRow {
  id: string
  stock_code: string | null
  lot_no: string | null
  expiry_date: string | null
  quantity: number
  unit: string | null
  warehouse_id: string
  product_id: string
  product_code: string | null
  product_name: string | null
  spec: string | null
  warehouse: MaybeArray<WarehouseOption>
}

export interface LookupStock {
  id: string
  stock_code: string | null
  lot_no: string | null
  expiry_date: string | null
  quantity: number
  unit: string | null
  warehouse_id: string
  product_id: string
  warehouse: MaybeArray<WarehouseOption>
}

export interface LookupResult {
  matched_by: 'item_code' | 'stock_code' | 'lot_no'
  product: ProductOption | null
  stocks: LookupStock[]
}

export interface InboundListRow {
  id: string
  doc_no: string | null
  status: DocStatus
  current_step: number | null
  gr_id: string | null
  is_new_lot: boolean
  order_date: string | null
  posted_at: string | null
  stocked_at: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  gr: MaybeArray<{ id: string; doc_no: string | null }>
  created_by_user: MaybeArray<NamedRef>
  items: MaybeArray<{ count: number }>
}

export interface OutboundListRow {
  id: string
  doc_no: string | null
  status: DocStatus
  current_step: number | null
  order_date: string | null
  shipment_no: string | null
  posted_at: string | null
  deducted_at: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  created_by_user: MaybeArray<NamedRef>
  items: MaybeArray<{ count: number }>
}

export interface InboundItemRow {
  id: string
  line_no: number | null
  product_id: string | null
  product_code: string | null
  product_name: string | null
  spec: string | null
  unit: string | null
  warehouse_id: string | null
  warehouse_stock_id: string | null
  stock_code: string | null
  lot_no: string | null
  expiry_date: string | null
  quantity: number
  notes: string | null
  warehouse: MaybeArray<WarehouseOption>
}

export interface OutboundItemRow {
  id: string
  line_no: number | null
  product_id: string | null
  product_code: string | null
  product_name: string | null
  spec: string | null
  unit: string | null
  warehouse_stock_id: string | null
  stock_code: string | null
  warehouse_qty: number | null
  used_qty: number
  qty_after_use: number | null
  notes: string | null
  stock: MaybeArray<{
    id: string
    stock_code: string | null
    lot_no: string | null
    expiry_date: string | null
    quantity: number
    warehouse: MaybeArray<WarehouseOption>
  }>
}

export interface OrderDoc extends Record<string, unknown> {
  id: string
  doc_no: string | null
  status: DocStatus
  current_step: number | null
  order_date: string | null
  posted_at: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  created_by_name: string | null
}

export interface OrderDetail<I> {
  doc: OrderDoc
  items: I[]
  steps: TimelineStep[]
  can_act: boolean
  current_step_kind: TimelineStep['approver_kind'] | null
}

export const STATUS_STYLE: Record<DocStatus, string> = {
  draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  in_approval: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
  approved: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  rejected: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  voided: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
}

/** Quantities are always 庫存單位; show with tabular figures and no trailing zeros. */
export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 4 })
}

/** Fetch helper for the exact-code lookup; returns null on 404 (unknown code). */
export async function lookupCode(code: string): Promise<LookupResult | null> {
  const res = await fetch(`/api/procurement/stock-lookup?code=${encodeURIComponent(code)}`)
  if (res.status === 404) return null
  const { data, error } = await res.json()
  if (error) throw new Error(error)
  return data as LookupResult
}
