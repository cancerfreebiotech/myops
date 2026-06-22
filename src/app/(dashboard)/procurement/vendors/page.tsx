import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { VendorsClient } from './VendorsClient'

export default async function ProcurementVendorsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, job_role, granted_features')
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

  const { data: vendors } = await service
    .from('vendors')
    .select('*, filled_by:users!vendors_filled_by_id_fkey(display_name)')
    .is('deleted_at', null)
    .order('vendor_code', { ascending: true, nullsFirst: false })

  const t = await getTranslations('procurement.vendors')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <VendorsClient vendors={vendors ?? []} canManage={canManage} />
    </div>
  )
}
