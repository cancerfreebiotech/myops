import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { JOB_ROLE_DEFAULT_FEATURES } from '@/lib/job-role-features'
import type { JobRole } from '@/types'

// GET /api/procurement/stats — record counts per procurement module, for the
// /procurement dashboard cards. All counts run in parallel via the service
// client using head-only exact counts (no rows transferred).
//
// Response shape:
//   { data: { vendors, products, rfqs, purchase_requests, goods_receipts,
//             inbound_orders, outbound_orders, payments, evaluations,
//             expiring_lots } }
//
// - payments     = deposit_requests + ap_requests + installment_requests
// - evaluations  = vendor_evaluations + product_evaluations
// - expiring_lots = warehouse_stock lots (quantity > 0) whose expiry_date is
//   within the next 60 days (including already-expired lots still in stock)

interface UserRow {
  id: string
  role: string
  job_role: string
  granted_features: string[] | null
}

/** Feature check via job_role defaults + granted_features (mirrors the inbox route) */
function holdsFeature(user: UserRow, feature: string): boolean {
  const defaults = JOB_ROLE_DEFAULT_FEATURES[user.job_role as JobRole] ?? []
  return defaults.includes(feature) || (user.granted_features ?? []).includes(feature)
}

interface CountResult {
  count: number | null
  error: { message: string } | null
}

/** Unwrap a head-count result; failed queries log and fall back to 0 so one bad table doesn't blank the dashboard. */
function toCount(result: CountResult, label: string): number {
  if (result.error) {
    console.error(`[procurement stats] ${label} count failed:`, result.error)
    return 0
  }
  return result.count ?? 0
}

export async function GET() {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: userData } = await service
    .from('users')
    .select('id, role, job_role, granted_features')
    .eq('id', user.id)
    .single()
  const me = userData as UserRow | null
  if (!me) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  // Feature gate (procurement_unit / procurement_manage / admin), same as the inbox route
  const hasProcurementAccess =
    me.role === 'admin' || holdsFeature(me, 'procurement_unit') || holdsFeature(me, 'procurement_manage')
  if (!hasProcurementAccess) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const head = { count: 'exact' as const, head: true }
  // 近效期 cutoff: today + 60 days (date-only comparison against expiry_date)
  const expiryCutoff = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)

  const [
    vendors,
    products,
    rfqs,
    purchaseRequests,
    goodsReceipts,
    inboundOrders,
    outboundOrders,
    depositRequests,
    apRequests,
    installmentRequests,
    vendorEvaluations,
    productEvaluations,
    expiringLots,
  ] = await Promise.all([
    service.from('vendors').select('id', head).is('deleted_at', null),
    service.from('products').select('id', head).is('deleted_at', null),
    service.from('rfqs').select('id', head),
    service.from('purchase_requests').select('id', head),
    service.from('goods_receipts').select('id', head),
    service.from('inbound_orders').select('id', head),
    service.from('outbound_orders').select('id', head),
    service.from('deposit_requests').select('id', head),
    service.from('ap_requests').select('id', head),
    service.from('installment_requests').select('id', head),
    service.from('vendor_evaluations').select('id', head),
    service.from('product_evaluations').select('id', head),
    service
      .from('warehouse_stock')
      .select('id', head)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', expiryCutoff)
      .gt('quantity', 0),
  ])

  return NextResponse.json({
    data: {
      vendors: toCount(vendors, 'vendors'),
      products: toCount(products, 'products'),
      rfqs: toCount(rfqs, 'rfqs'),
      purchase_requests: toCount(purchaseRequests, 'purchase_requests'),
      goods_receipts: toCount(goodsReceipts, 'goods_receipts'),
      inbound_orders: toCount(inboundOrders, 'inbound_orders'),
      outbound_orders: toCount(outboundOrders, 'outbound_orders'),
      payments:
        toCount(depositRequests, 'deposit_requests') +
        toCount(apRequests, 'ap_requests') +
        toCount(installmentRequests, 'installment_requests'),
      evaluations:
        toCount(vendorEvaluations, 'vendor_evaluations') +
        toCount(productEvaluations, 'product_evaluations'),
      expiring_lots: toCount(expiringLots, 'expiring_lots'),
    },
  })
}
