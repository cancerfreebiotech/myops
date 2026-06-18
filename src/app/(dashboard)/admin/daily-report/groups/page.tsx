import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { GroupsClient } from './GroupsClient'

export default async function DailyReportGroupsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await service
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (currentUser?.role !== 'admin') redirect('/')

  const { data: groups } = await service
    .from('daily_report_groups')
    .select(`
      id, name, description, created_at,
      members:daily_report_group_members(
        user_id, role,
        user:users(id, display_name, email)
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const { data: allUsers } = await service
    .from('users')
    .select('id, display_name, email')
    .eq('is_active', true)
    .order('display_name')

  const t = await getTranslations('dailyReport')

  return (
    <div>
      <PageHeader title={t('groupsTitle')} description={t('groupsDescription')} />
      <GroupsClient
        initialGroups={(groups ?? []) as any}
        allUsers={allUsers ?? []}
      />
    </div>
  )
}
