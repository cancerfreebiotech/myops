import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { leave_type_id, start_date, end_date, half_day, total_days, reason, deputy_id } = body

  if (!leave_type_id || !start_date || !end_date || !total_days || !reason) {
    return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 })
  }

  // Get user info for approver chain
  const { data: userRecord } = await service
    .from('users')
    .select('manager_id, employment_type, display_name')
    .eq('id', user.id)
    .single()

  // Check leave balance
  const currentYear = new Date().getFullYear()
  const { data: balance } = await service
    .from('leave_balances')
    .select('id, remaining_days')
    .eq('user_id', user.id)
    .eq('leave_type_id', leave_type_id)
    .eq('year', currentYear)
    .single()

  const { data: leaveType } = await service
    .from('leave_types')
    .select('max_days_per_year, name')
    .eq('id', leave_type_id)
    .single()

  if (leaveType?.max_days_per_year && balance) {
    if (balance.remaining_days < total_days) {
      return NextResponse.json({ error: `${leaveType.name}餘額不足（剩餘 ${balance.remaining_days} 天）` }, { status: 400 })
    }
  }

  const { data, error } = await service.from('leave_requests').insert({
    user_id: user.id,
    leave_type_id,
    start_date,
    end_date,
    half_day: half_day ?? null,
    total_days,
    reason,
    deputy_id: deputy_id ?? null,
    approver_id: userRecord?.manager_id ?? null,
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') ?? 'mine'
  const calendarMode = searchParams.get('calendar') === '1'
  const startParam = searchParams.get('start')
  const endParam = searchParams.get('end')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features, department_id')
    .eq('id', user.id)
    .single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = (currentUser?.granted_features as string[] ?? []).includes('hr_manager')

  // Calendar mode: return department/all leaves for a date range
  if (calendarMode && startParam && endParam) {
    let calQuery = service
      .from('leave_requests')
      .select(`id, user_id, leave_type_id, start_date, end_date, status, reason,
        user:users!leave_requests_user_id_fkey(id, display_name, department_id),
        leave_type:leave_types(name)`)
      .in('status', ['approved', 'pending'])
      .lte('start_date', endParam)
      .gte('end_date', startParam)

    if (!isAdmin && !isHR) {
      // Regular user: only same department
      calQuery = calQuery.eq('user.department_id', currentUser?.department_id)
    }

    const { data: calData, error: calError } = await calQuery
    if (calError) return NextResponse.json({ error: calError.message }, { status: 500 })

    // Flatten for CalendarClient
    const flat = (calData ?? []).map((r: any) => {
      const u = Array.isArray(r.user) ? r.user[0] : r.user
      const lt = Array.isArray(r.leave_type) ? r.leave_type[0] : r.leave_type
      return {
        id: r.id,
        user_id: r.user_id,
        leave_type_id: r.leave_type_id,
        start_date: r.start_date,
        end_date: r.end_date,
        status: r.status,
        reason: r.reason,
        display_name: u?.display_name ?? '',
        department_id: u?.department_id ?? '',
        leave_type_name: lt?.name ?? '',
      }
    })

    return NextResponse.json({ data: flat })
  }

  let query = service
    .from('leave_requests')
    .select(`*, user:users!leave_requests_user_id_fkey(id, display_name), leave_type:leave_types(name, pay_rate)`)
    .order('created_at', { ascending: false })

  if (view === 'mine') {
    query = query.eq('user_id', user.id)
  } else if (view === 'approve') {
    if (isAdmin || isHR) {
      query = query.eq('status', 'pending')
    } else {
      query = query.eq('approver_id', user.id).eq('status', 'pending')
    }
  } else if (view === 'team' && (isAdmin || isHR)) {
    // All requests
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
