import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { pickBalanceForDate } from '@/lib/leave-balance'

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const body = await request.json()
  // total_days 一律由 server 依 start_date/end_date + 半天重算，不採用前端傳來的值。
  const { leave_type_id, start_date, end_date, half_day, reason, deputy_id } = body

  if (!leave_type_id || !start_date || !end_date || !reason) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRe.test(start_date) || !dateRe.test(end_date)
      || Number.isNaN(Date.parse(`${start_date}T00:00:00Z`)) || Number.isNaN(Date.parse(`${end_date}T00:00:00Z`))) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  // 依日期重算天數（含半天）：以台北日曆日計，含頭尾（與前端 differenceInCalendarDays+1 一致）；
  // 半天僅單日有效（start_date === end_date），多日區間一律以整天計。
  const startMs = Date.parse(`${start_date}T00:00:00Z`)
  const endMs = Date.parse(`${end_date}T00:00:00Z`)
  if (endMs < startMs) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }
  const calendarDays = Math.round((endMs - startMs) / 86_400_000) + 1
  const isSingleDay = calendarDays === 1
  // 半天假：client 傳 half_day（morning/afternoon）；DB 用 start_half/end_half
  const half = isSingleDay && (half_day === 'morning' || half_day === 'afternoon') ? half_day : 'full'
  const total_days = half === 'full' ? calendarDays : 0.5
  if (!(total_days > 0)) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  // Check leave balance（leave_balances 無 remaining_days，以 total_days - used_days 計算）；
  // 依請假 start_date 解析餘額歸屬：特休採週年制（落在對應 period），其餘假別以曆年 fallback
  // （與核准端 [id]/route.ts 一致），避免跨年/跨週年假餘額歸屬錯置。
  const { data: balanceRows } = await service
    .from('leave_balances')
    .select('id, total_days, used_days, period_start, period_end, year')
    .eq('user_id', user.id)
    .eq('leave_type_id', leave_type_id)
  const balance = pickBalanceForDate(balanceRows ?? [], start_date)

  const { data: leaveType } = await service
    .from('leave_types')
    .select('default_quota_days, requires_qualification, name:name_zh')
    .eq('id', leave_type_id)
    .single()

  // T9 特殊假別（婚/喪/產/陪產/產檢/安胎/育嬰留停…）：requires_qualification=true 者
  // 需 HR 先審核資格並於餘額管理頁核給天數。資格判定＝「曾獲核給」（任一餘額列
  // total_days > 0，不做 period 解析）——HR 的餘額管理頁只能寫當年度列，若以
  // start_date 的年度解析，年底核給、申請隔年初的假（如育嬰留停需提前申請）會被誤擋。
  const qualificationRows = (balanceRows ?? [])
    .filter(r => Number(r.total_days) > 0)
    .sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0))
  if (leaveType?.requires_qualification && qualificationRows.length === 0) {
    return NextResponse.json(
      { error: t('leaveRequests.qualificationRequired', { name: leaveType?.name ?? '' }) },
      { status: 400 }
    )
  }

  // 有 balance 記錄即代表該假別已配額（total_days 為可用額度），就檢查餘額；
  // 不以 leaveType.default_quota_days 判斷（特休等 by_seniority 假別此欄為 NULL，
  // 但仍會由 HR 建立 balance，必須控管餘額）。無 balance = 無限制假別，不檢查。
  // 特殊假別跨年申請（start_date 當期無列）時，以最近一筆核給列控管額度。
  const effectiveBalance = balance
    ?? (leaveType?.requires_qualification ? qualificationRows[0] : undefined)
  if (effectiveBalance) {
    const remaining = Number(effectiveBalance.total_days) - Number(effectiveBalance.used_days ?? 0)
    if (remaining < total_days) {
      return NextResponse.json({ error: t('leaveRequests.insufficientBalance', { name: leaveType?.name ?? '', remaining }) }, { status: 400 })
    }
  }

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
      // leave_requests 無 approver_id：主管只看直屬部屬（users.manager_id = 自己）的 pending
      const { data: reports } = await service.from('users').select('id').eq('manager_id', user.id)
      const reportIds = (reports ?? []).map(r => r.id)
      query = query
        .eq('status', 'pending')
        .in('user_id', reportIds.length ? reportIds : ['00000000-0000-0000-0000-000000000000'])
    }
  } else if (view === 'team' && (isAdmin || isHR)) {
    // All requests
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
