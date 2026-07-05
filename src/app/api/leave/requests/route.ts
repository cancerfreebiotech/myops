import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { taipeiToday } from '@/lib/taipei-date'

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const body = await request.json()
  const { leave_type_id, start_date, end_date, half_day, total_days, reason, deputy_id } = body

  if (!leave_type_id || !start_date || !end_date || !total_days || !reason) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  // Check leave balance（leave_balances 無 remaining_days，以 total_days - used_days 計算）
  const currentYear = Number(taipeiToday().slice(0, 4))
  const { data: balance } = await service
    .from('leave_balances')
    .select('id, total_days, used_days')
    .eq('user_id', user.id)
    .eq('leave_type_id', leave_type_id)
    .eq('year', currentYear)
    .single()

  const { data: leaveType } = await service
    .from('leave_types')
    .select('default_quota_days, name:name_zh')
    .eq('id', leave_type_id)
    .single()

  if (leaveType?.default_quota_days && balance) {
    const remaining = Number(balance.total_days) - Number(balance.used_days ?? 0)
    if (remaining < total_days) {
      return NextResponse.json({ error: t('leaveRequests.insufficientBalance', { name: leaveType.name, remaining }) }, { status: 400 })
    }
  }

  // 半天假：client 傳 half_day（morning/afternoon）；DB 用 start_half/end_half
  const half = half_day === 'morning' || half_day === 'afternoon' ? half_day : 'full'

  const { data, error } = await service.from('leave_requests').insert({
    user_id: user.id,
    leave_type_id,
    start_date,
    end_date,
    start_half: half,
    end_half: half,
    total_days,
    reason,
    deputy_user_id: deputy_id ?? null,
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

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

  // Calendar mode：部門範圍內的請假（改走 calendar_dept_leaves SECURITY DEFINER function，
  // 部門範圍與欄位由 DB 端把關，關閉「已核准全員可直讀他人 reason」的洩漏）
  if (calendarMode && startParam && endParam) {
    const { data: calData, error: calError } = await service.rpc('calendar_dept_leaves', {
      p_from: startParam,
      p_to: endParam,
    })
    if (calError) return NextResponse.json({ error: calError.message }, { status: 500 })

    const flat = (calData ?? []).map((r: {
      id: string; user_id: string; leave_type_id: string; start_date: string; end_date: string
      status: string; reason: string | null; display_name: string | null; department_id: string | null; leave_type_name: string | null
    }) => ({
      id: r.id,
      user_id: r.user_id,
      leave_type_id: r.leave_type_id,
      start_date: r.start_date,
      end_date: r.end_date,
      status: r.status,
      reason: r.reason,
      display_name: r.display_name ?? '',
      department_id: r.department_id ?? '',
      leave_type_name: r.leave_type_name ?? '',
    }))

    return NextResponse.json({ data: flat })
  }

  let query = service
    .from('leave_requests')
    .select(`*, user:users!leave_requests_user_id_fkey(id, display_name), leave_type:leave_types(name:name_zh, pay_rate:salary_ratio)`)
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
