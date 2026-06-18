import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/daily-report/team?date=YYYY-MM-DD&groupId=xxx
// Returns all members' schedules + completions + kpi entries for a group on a date
// Viewer/admin only
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const groupId = searchParams.get('groupId')

  if (!date || !groupId) return NextResponse.json({ error: 'Missing date or groupId' }, { status: 400 })

  // Verify requester is viewer of this group or admin
  const { data: userRow } = await service.from('users').select('role').eq('id', user.id).single()
  const isAdmin = userRow?.role === 'admin'

  if (!isAdmin) {
    const { data: membership } = await service
      .from('daily_report_group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership || membership.role !== 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Get all members in this group
  const { data: members } = await service
    .from('daily_report_group_members')
    .select('user_id, users(id, display_name, email)')
    .eq('group_id', groupId)
    .eq('role', 'member')

  const memberIds = (members ?? []).map((m: any) => m.user_id)
  if (!memberIds.length) return NextResponse.json({ data: { members: [], schedules: [], completions: [], kpiEntries: [], kpiDefs: [] } })

  const [schedules, completions, kpiEntries, kpiDefs] = await Promise.all([
    service.from('daily_schedules').select('*').in('user_id', memberIds).eq('date', date),
    service.from('daily_completions').select('*').in('user_id', memberIds).eq('date', date),
    service.from('dr_kpi_entries').select('*').in('user_id', memberIds).eq('date', date),
    service.from('dr_kpi_definitions').select('*').in('user_id', memberIds).order('sort_order'),
  ])

  return NextResponse.json({
    data: {
      members: (members ?? []).map((m: any) => ({ user_id: m.user_id, ...m.users })),
      schedules: schedules.data ?? [],
      completions: completions.data ?? [],
      kpiEntries: kpiEntries.data ?? [],
      kpiDefs: kpiDefs.data ?? [],
    }
  })
}
