import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { ProductsClient } from './ProductsClient'

export default async function ProcurementProductsPage() {
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

  const canManage = userHasFeature(role, jobRole, granted, 'procurement_manage')

  const { data: products } = await service
    .from('products')
    .select('*')
    .is('deleted_at', null)
    .order('product_code', { ascending: true, nullsFirst: false })

  const t = await getTranslations('procurement.products')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <ProductsClient products={products ?? []} canManage={canManage} />
    </div>
  )
}
