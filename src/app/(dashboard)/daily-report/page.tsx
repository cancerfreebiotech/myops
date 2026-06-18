import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { DailyReportClient } from './DailyReportClient'

export default async function DailyReportPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await service
    .from('users')
    .select('id, role, display_name, email')
    .eq('id', user.id)
    .single()

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'daily_report')) redirect('/')

  // Check if user is a viewer of any group
  const { data: viewerMembership } = await service
    .from('daily_report_group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('role', 'viewer')
    .limit(1)

  const isViewer = currentUser?.role === 'admin' || (viewerMembership?.length ?? 0) > 0

  const t = await getTranslations('dailyReport')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <DailyReportClient userId={user.id} isViewer={isViewer} />
    </div>
  )
}
