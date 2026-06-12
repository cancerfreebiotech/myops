import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { InventoryClient } from './InventoryClient'
import type {
  InboundListRow,
  OutboundListRow,
  ProductOption,
  StockRow,
  WarehouseOption,
} from './types'

// 庫存作業 — 入庫單 / 出庫單 / 庫存查詢 (+ mobile-first 掃描模式).
// Auth + 'procurement' feature flag gate on the server; all interaction runs
// in the client against /api/procurement/{inbound,outbound,stock-lookup}.

const INBOUND_SELECT =
  'id, doc_no, status, current_step, gr_id, is_new_lot, order_date, posted_at, stocked_at, notes, created_at, created_by, ' +
  'gr:goods_receipts(id, doc_no), ' +
  'created_by_user:users!inbound_orders_created_by_fkey(id, display_name), ' +
  'items:inbound_items(count)'

const OUTBOUND_SELECT =
  'id, doc_no, status, current_step, order_date, shipment_no, posted_at, deducted_at, notes, created_at, created_by, ' +
  'created_by_user:users!outbound_orders_created_by_fkey(id, display_name), ' +
  'items:outbound_items(count)'

export default async function InventoryPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, job_role, granted_features')
    .eq('id', user.id)
    .single()
  if (!currentUser) redirect('/login')

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser.role, featureFlags, 'procurement')) redirect('/')

  const granted = (currentUser.granted_features as string[] | null) ?? []
  const hasAccess =
    userHasFeature(currentUser.role, currentUser.job_role, granted, 'procurement_unit') ||
    userHasFeature(currentUser.role, currentUser.job_role, granted, 'procurement_manage')
  if (!hasAccess) redirect('/')

  const [
    { data: inboundOrders },
    { data: outboundOrders },
    { data: warehouses },
    { data: products },
    { data: stocks },
  ] = await Promise.all([
    service.from('inbound_orders').select(INBOUND_SELECT).order('created_at', { ascending: false }).limit(200),
    service.from('outbound_orders').select(OUTBOUND_SELECT).order('created_at', { ascending: false }).limit(200),
    service.from('warehouses').select('id, code, name').is('deleted_at', null).order('code', { ascending: true }),
    service
      .from('products')
      .select('id, product_code, name, spec, item_code, purchase_unit, stock_unit, units_per_purchase, current_stock_qty')
      .is('deleted_at', null)
      .order('product_code', { ascending: true, nullsFirst: false })
      .limit(1000),
    service
      .from('warehouse_stock')
      .select('id, stock_code, lot_no, expiry_date, quantity, unit, warehouse_id, product_id, product_code, product_name, spec, warehouse:warehouses(id, code, name)')
      .order('stock_code', { ascending: true, nullsFirst: false })
      .limit(2000),
  ])

  const t = await getTranslations('procurement.inventory')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <InventoryClient
        currentUserId={currentUser.id}
        initialInbound={(inboundOrders as unknown as InboundListRow[]) ?? []}
        initialOutbound={(outboundOrders as unknown as OutboundListRow[]) ?? []}
        warehouses={(warehouses as unknown as WarehouseOption[]) ?? []}
        products={(products as unknown as ProductOption[]) ?? []}
        initialStocks={(stocks as unknown as StockRow[]) ?? []}
      />
    </div>
  )
}
