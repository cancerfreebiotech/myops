import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { PageHeader } from '@/components/layout/PageHeader'
import { PerformanceClient } from './PerformanceClient'

export default async function PerformancePage() {
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
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'performance')) redirect('/no-permission')

  const isHR = currentUser?.role === 'admin'
    || ((currentUser?.granted_features as string[] | null) ?? []).includes('hr_manager')

  // 有直屬部屬、或有考核記錄指定我為主管者，顯示團隊考核 tab
  let showTeamTab = isHR
  if (!showTeamTab) {
    const { data: reports } = await service
      .from('users')
      .select('id')
      .eq('manager_id', user.id)
      .limit(1)
    showTeamTab = (reports?.length ?? 0) > 0
  }
  if (!showTeamTab) {
    const { data: managed } = await service
      .from('performance_reviews')
      .select('id')
      .eq('manager_id', user.id)
      .limit(1)
    showTeamTab = (managed?.length ?? 0) > 0
  }

  const t = await getTranslations('performance')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <PerformanceClient isHR={isHR} showTeamTab={showTeamTab} currentUserId={user.id} />
    </div>
  )
}
