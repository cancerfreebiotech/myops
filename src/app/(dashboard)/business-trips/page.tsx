import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { PageHeader } from '@/components/layout/PageHeader'
import { BusinessTripsClient } from './BusinessTripsClient'

export default async function BusinessTripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = await createServiceClient()
  const { data: currentUser } = await service
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'business_trip')) redirect('/no-permission')

  const isApprover = currentUser?.role === 'admin'
    || ((currentUser?.granted_features as string[] | null) ?? []).includes('hr_manager')

  // 一般主管（被指定為 approver_id 者）也要能看到待審核 tab
  let showApproveTab = isApprover
  if (!showApproveTab) {
    const { data: pendingAsApprover } = await service
      .from('business_trips')
      .select('id')
      .eq('approver_id', user.id)
      .eq('status', 'pending')
      .limit(1)
    showApproveTab = (pendingAsApprover?.length ?? 0) > 0
  }

  const t = await getTranslations('businessTrip')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <BusinessTripsClient showApproveTab={showApproveTab} />
    </div>
  )
}
