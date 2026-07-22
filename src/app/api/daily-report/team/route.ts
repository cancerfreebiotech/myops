import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

// 模組關閉時（feature.daily_report off）非 admin 一律擋下，與頁面 canAccessFeature 一致
async function dailyReportEnabled(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  const flags = await getFeatureFlags()
  return canAccessFeature(data?.role ?? '', flags, 'daily_report')
}

// GET /api/daily-report/team?date=YYYY-MM-DD&groupId=xxx
// Returns all members' schedules + completions + kpi entries for a group on a date
// admin / 該群組 viewer：完整資料；該群組 member：唯讀且不含任何 KPI 資料
// （成員互看行程以便互相支援，KPI 僅限 admin 與 viewer）
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await dailyReportEnabled(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const groupId = searchParams.get('groupId')

  if (!date || !groupId) return NextResponse.json({ error: 'Missing date or groupId' }, { status: 400 })

  // 已刪除（soft-delete）的群組不再提供資料
  const { data: group } = await service
    .from('daily_report_groups')
    .select('id')
    .eq('id', groupId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  // Verify requester is admin, or viewer/member of this group.
  // member 可看行程與完成回報（互相支援用），但看不到 KPI。
  const { data: userRow } = await service.from('users').select('role').eq('id', user.id).single()
  const isAdmin = userRow?.role === 'admin'
  let canSeeKpi = isAdmin

  if (!isAdmin) {
    const { data: membership } = await service
      .from('daily_report_group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    canSeeKpi = membership.role === 'viewer'
  }

  // Get all members in this group
  const { data: members } = await service
    .from('daily_report_group_members')
    .select('user_id, users(id, display_name, email)')
    .eq('group_id', groupId)
    .eq('role', 'member')

  type MemberRow = { user_id: string; users: { id: string; display_name: string | null; email: string } | null }
  // supabase-js 將 many-to-one 關聯推斷為陣列，runtime 實為單一物件
  const memberRows = (members ?? []) as unknown as MemberRow[]
  const memberIds = memberRows.map(m => m.user_id)
  if (!memberIds.length) return NextResponse.json({ data: { members: [], schedules: [], completions: [], kpiEntries: [], kpiDefs: [], canSeeKpi } })

  // member 請求完全不查 KPI（回應中也不含 KPI 資料）；
  // 行程與完成回報靠 RLS（viewer / 同群組 groupmate policy）逐列把關。
  const [schedules, completions, kpiEntries, kpiDefs] = await Promise.all([
    service.from('daily_schedules').select('*').in('user_id', memberIds).eq('date', date),
    service.from('daily_completions').select('*').in('user_id', memberIds).eq('date', date),
    canSeeKpi
      ? service.from('dr_kpi_entries').select('*').in('user_id', memberIds).eq('date', date)
      : Promise.resolve({ data: [] }),
    canSeeKpi
      ? service.from('dr_kpi_definitions').select('*').in('user_id', memberIds).eq('active', true).order('sort_order')
      : Promise.resolve({ data: [] }),
  ])

  return NextResponse.json({
    data: {
      members: memberRows.map(m => ({ user_id: m.user_id, ...m.users })),
      schedules: schedules.data ?? [],
      completions: completions.data ?? [],
      kpiEntries: kpiEntries.data ?? [],
      kpiDefs: kpiDefs.data ?? [],
      canSeeKpi,
    }
  })
}
