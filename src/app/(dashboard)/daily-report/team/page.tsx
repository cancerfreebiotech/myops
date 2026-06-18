import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { TeamViewClient } from './TeamViewClient'

export default async function DailyReportTeamPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await service
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single()

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'daily_report')) redirect('/')

  const isAdmin = currentUser?.role === 'admin'

  // Load groups where user is viewer (or all groups if admin)
  let groups: { id: string; name: string }[] = []
  if (isAdmin) {
    const { data } = await service
      .from('daily_report_groups')
      .select('id, name')
      .is('deleted_at', null)
      .order('name')
    groups = data ?? []
  } else {
    const { data } = await service
      .from('daily_report_group_members')
      .select('group_id, daily_report_groups(id, name)')
      .eq('user_id', user.id)
      .eq('role', 'viewer')
    groups = (data ?? [])
      .map((m: any) => m.daily_report_groups)
      .filter(Boolean) as { id: string; name: string }[]
  }

  if (!groups.length) redirect('/daily-report')

  const t = await getTranslations('dailyReport')

  return (
    <div>
      <PageHeader title={t('teamTitle')} description={t('teamDescription')} />
      <TeamViewClient groups={groups} />
    </div>
  )
}
