import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { TasksClient } from './TasksClient'

export default async function DailyReportTasksPage() {
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
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'daily_report')) redirect('/no-permission')

  const { data: viewerMembership } = await service
    .from('daily_report_group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('role', 'viewer')
    .limit(1)

  const isViewer = currentUser?.role === 'admin' || (viewerMembership?.length ?? 0) > 0

  // Load all users for task assignment (viewer/admin only)
  let allUsers: { id: string; display_name: string | null; email: string }[] = []
  if (isViewer) {
    const { data } = await service
      .from('users')
      .select('id, display_name, email')
      .eq('is_active', true)
      .order('display_name')
    allUsers = data ?? []
  }

  const t = await getTranslations('dailyReport')

  return (
    <div>
      <PageHeader title={t('tasksTitle')} description={t('tasksDescription')} />
      <TasksClient userId={user.id} isViewer={isViewer} allUsers={allUsers} />
    </div>
  )
}
