import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { InventoryDetailClient } from './InventoryDetailClient'
import type { ProductOption, StockRow, WarehouseOption } from '../../types'

// 入庫單 / 出庫單明細頁（與請採購單一致：列表 → 獨立頁面）。
// Auth + 'procurement' feature gate 與列表頁相同；單據本身由 client 透過
// /api/procurement/{inbound,outbound}/[id] 載入，才能在每次動作後重新整理。
// 倉庫／商品／庫存清單在此預取，供草稿的編輯表單使用。

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ direction: string; id: string }>
}) {
  const { direction, id } = await params
  if (direction !== 'inbound' && direction !== 'outbound') notFound()

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
  if (!canAccessFeature(currentUser.role, featureFlags, 'procurement')) redirect('/no-permission')

  const granted = (currentUser.granted_features as string[] | null) ?? []
  const hasAccess =
    userHasFeature(currentUser.role, currentUser.job_role, granted, 'procurement_unit') ||
    userHasFeature(currentUser.role, currentUser.job_role, granted, 'procurement_manage')
  if (!hasAccess) redirect('/no-permission')

  const [{ data: doc }, { data: warehouses }, { data: products }, { data: stocks }] = await Promise.all([
    service.from(direction === 'inbound' ? 'inbound_orders' : 'outbound_orders').select('id').eq('id', id).maybeSingle(),
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
  if (!doc) notFound()

  return (
    <InventoryDetailClient
      direction={direction}
      docId={id}
      warehouses={(warehouses as unknown as WarehouseOption[]) ?? []}
      products={(products as unknown as ProductOption[]) ?? []}
      stocks={(stocks as unknown as StockRow[]) ?? []}
    />
  )
}
