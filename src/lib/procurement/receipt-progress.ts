// Server-only: keep pr_items.received_qty / pending_qty (+ the PR's
// fulfillment_status) in sync with what has actually been inbounded.
//
// The stock ledger (warehouse_stock / stock_movements) is authoritative; these
// pr_items columns are a display cache read by the GR / PR detail screens
// (已進貨數量 / 尚未進貨數量). Nothing wrote them after PR creation, so progress
// always showed received=0. We update them when an inbound order is posted
// (received += ) and when it is unposted/voided (received −=).
//
// Unit note: inbound_items.quantity is in 庫存單位 (stock units); pr_items are in
// 採購單位 (purchase units). We convert back with products.units_per_purchase.
// Matching is by product_id (best-effort — inbound lines carry no pr_item FK),
// distributed across a product's pr_items in line order and clamped to
// [0, quantity], so an over-received posting can never push the cache past the
// ordered amount. Best-effort: never throws (a failure must not fail posting).

import { createServiceClient } from '@/lib/supabase/server'

type Service = Awaited<ReturnType<typeof createServiceClient>>

const round2 = (n: number) => Math.round(n * 100) / 100
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)

interface PrItem {
  id: string
  line_no: number | null
  product_id: string | null
  quantity: number | null
  received_qty: number | null
}

/**
 * Apply an inbound order's quantities to the upstream PR's pr_items receipt
 * progress. `direction` 'post' adds received quantity, 'unpost' removes it.
 */
export async function applyInboundReceipt(
  service: Service,
  write: Service,
  inboundOrderId: string,
  direction: 'post' | 'unpost'
): Promise<void> {
  try {
    const sign = direction === 'post' ? 1 : -1

    // inbound → gr → pr
    const { data: order } = await service
      .from('inbound_orders')
      .select('id, gr_id')
      .eq('id', inboundOrderId)
      .maybeSingle()
    const grId = (order as { gr_id?: string | null } | null)?.gr_id
    if (!grId) return // manual inbound not tied to a PR → nothing to sync

    const { data: gr } = await service
      .from('goods_receipts')
      .select('pr_id')
      .eq('id', grId)
      .maybeSingle()
    const prId = (gr as { pr_id?: string | null } | null)?.pr_id
    if (!prId) return

    const { data: inItemsData } = await service
      .from('inbound_items')
      .select('product_id, quantity')
      .eq('inbound_order_id', inboundOrderId)
    const inItems = (inItemsData as { product_id: string | null; quantity: number | null }[] | null) ?? []
    if (inItems.length === 0) return

    const { data: prItemsData } = await service
      .from('pr_items')
      .select('id, line_no, product_id, quantity, received_qty')
      .eq('pr_id', prId)
    const prItems = (prItemsData as PrItem[] | null) ?? []
    if (prItems.length === 0) return

    // conversion ratios (stock units per purchase unit)
    const productIds = [...new Set(inItems.map(i => i.product_id).filter((v): v is string => typeof v === 'string'))]
    const ratioById = new Map<string, number>()
    if (productIds.length > 0) {
      const { data: prods } = await service
        .from('products')
        .select('id, units_per_purchase')
        .in('id', productIds)
      for (const p of (prods as { id: string; units_per_purchase: number | null }[] | null) ?? []) {
        ratioById.set(p.id, Number(p.units_per_purchase ?? 1) || 1)
      }
    }

    // purchase-unit received delta per product (stock qty ÷ ratio)
    const purchaseByProduct = new Map<string, number>()
    for (const it of inItems) {
      if (!it.product_id) continue
      const ratio = ratioById.get(it.product_id) ?? 1
      const purchaseQty = (Number(it.quantity ?? 0) || 0) / ratio
      purchaseByProduct.set(it.product_id, (purchaseByProduct.get(it.product_id) ?? 0) + purchaseQty)
    }

    const prByProduct = new Map<string, PrItem[]>()
    for (const pr of prItems) {
      if (!pr.product_id) continue
      const arr = prByProduct.get(pr.product_id) ?? []
      arr.push(pr)
      prByProduct.set(pr.product_id, arr)
    }

    const updates: { id: string; received: number; pending: number }[] = []
    for (const [productId, delta] of purchaseByProduct) {
      const list = (prByProduct.get(productId) ?? []).slice().sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
      let remaining = delta
      for (const pr of list) {
        if (remaining <= 0) break
        const qty = Number(pr.quantity ?? 0) || 0
        const cur = Number(pr.received_qty ?? 0) || 0
        // post: fill remaining room up to ordered qty; unpost: remove down to 0
        const room = sign > 0 ? Math.max(qty - cur, 0) : cur
        const applied = Math.min(room, remaining)
        remaining -= applied
        const newReceived = round2(clamp(cur + sign * applied, 0, qty))
        updates.push({ id: pr.id, received: newReceived, pending: round2(qty - newReceived) })
      }
    }

    const now = new Date().toISOString()
    for (const u of updates) {
      const { data: rows } = await write
        .from('pr_items')
        .update({ received_qty: u.received, pending_qty: u.pending, updated_at: now })
        .eq('id', u.id)
        .select('id')
      if (!rows || rows.length === 0) console.warn(`[procurement] receipt-progress: pr_items ${u.id} update affected 0 rows`)
    }

    await refreshFulfillmentStatus(service, write, prId)
  } catch (e) {
    console.error(`[procurement] receipt-progress sync (${direction}) failed for inbound ${inboundOrderId}:`, e)
  }
}

/** Recompute purchase_requests.fulfillment_status from its pr_items. */
async function refreshFulfillmentStatus(service: Service, write: Service, prId: string): Promise<void> {
  const { data } = await service.from('pr_items').select('quantity, received_qty').eq('pr_id', prId)
  const rows = (data as { quantity: number | null; received_qty: number | null }[] | null) ?? []
  if (rows.length === 0) return
  const totalOrdered = rows.reduce((s, r) => s + (Number(r.quantity ?? 0) || 0), 0)
  const totalReceived = rows.reduce((s, r) => s + (Number(r.received_qty ?? 0) || 0), 0)
  const status = totalReceived <= 0 ? '尚未進貨' : totalReceived >= totalOrdered ? '進貨完成' : '部分進貨'
  const { data: updated } = await write
    .from('purchase_requests')
    .update({ fulfillment_status: status, updated_at: new Date().toISOString() })
    .eq('id', prId)
    .select('id')
  if (!updated || updated.length === 0) console.warn(`[procurement] receipt-progress: purchase_requests ${prId} fulfillment update affected 0 rows`)
}
