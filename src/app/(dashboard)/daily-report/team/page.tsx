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
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'daily_report')) redirect('/no-permission')

  const isAdmin = currentUser?.role === 'admin'

  // Load groups where user is viewer OR member (or all groups if admin)。
  // member 可唯讀瀏覽（不含 KPI），viewer/admin 額外可管理 KPI 指標。
  let groups: { id: string; name: string; canManageKpi: boolean }[] = []
  if (isAdmin) {
    const { data } = await service
      .from('daily_report_groups')
      .select('id, name')
      .is('deleted_at', null)
      .order('name')
    groups = (data ?? []).map(g => ({ ...g, canManageKpi: true }))
  } else {
    const { data } = await service
      .from('daily_report_group_members')
      .select('group_id, role, daily_report_groups(id, name)')
      .eq('user_id', user.id)
    // supabase-js 將 many-to-one 關聯推斷為陣列，runtime 實為單一物件
    groups = ((data ?? []) as unknown as { role: string; daily_report_groups: { id: string; name: string } | null }[])
      .filter(m => m.daily_report_groups)
      .map(m => ({
        id: m.daily_report_groups!.id,
        name: m.daily_report_groups!.name,
        canManageKpi: m.role === 'viewer',
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  if (!groups.length) redirect('/no-permission')

  const t = await getTranslations('dailyReport')

  return (
    <div>
      <PageHeader title={t('teamTitle')} description={t('teamDescription')} />
      <TeamViewClient groups={groups} />
    </div>
  )
}
