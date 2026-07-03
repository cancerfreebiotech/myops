import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { PageHeader } from '@/components/layout/PageHeader'
import { InsightsClient } from './InsightsClient'

export default async function InsightsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = await createServiceClient()
  const { data: currentUser } = await service
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'insights')) redirect('/no-permission')
  // 營運數據限管理員
  if (currentUser?.role !== 'admin') redirect('/no-permission')

  const t = await getTranslations('insights')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <InsightsClient />
    </div>
  )
}
