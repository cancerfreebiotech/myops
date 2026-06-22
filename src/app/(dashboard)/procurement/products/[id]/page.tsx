import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { ProductLedgerClient } from './ProductLedgerClient'

// 商品出入庫分類帳 — per-product stock ledger (all quantities in stock unit)

export default async function ProductLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, job_role, granted_features')
    .eq('id', user.id)
    .single()

  const role = currentUser?.role ?? ''
  const jobRole = currentUser?.job_role ?? ''
  const granted = (currentUser?.granted_features as string[] | null) ?? []

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(role, featureFlags, 'procurement')) redirect('/no-permission')

  const canRead =
    userHasFeature(role, jobRole, granted, 'procurement_unit') ||
    userHasFeature(role, jobRole, granted, 'procurement_manage')
  if (!canRead) redirect('/no-permission')

  const { data: product } = await service
    .from('products')
    .select('id, product_code, name, spec, brand, category, item_code, purchase_unit, stock_unit, units_per_purchase, current_stock_qty')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!product) notFound()

  const t = await getTranslations('procurement.ledger')

  return (
    <div>
      <PageHeader
        title={product.product_code ? `${product.product_code} — ${product.name}` : product.name}
        description={t('description')}
      />
      <ProductLedgerClient product={product} />
    </div>
  )
}
