import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import * as XLSX from 'xlsx'
import { lastDayOfMonth } from '@/lib/date-utils'

interface DepartmentJoin { name: string | null }
interface UserJoin {
  display_name: string | null
  email: string | null
  department: DepartmentJoin | DepartmentJoin[] | null
}
interface AttendanceExportRow {
  clock_date: string
  clock_in: string | null
  clock_out: string | null
  is_auto_in: boolean | null
  is_auto_out: boolean | null
  note: string | null
  user: UserJoin | UserJoin[] | null
}

// T59: Export attendance records as xlsx
export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.granted_features?.includes('hr_manager')
  if (!isAdmin && !isHR) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const yearMonth = searchParams.get('month') // format: 2026-04
  const now = new Date()
  const y = yearMonth ? parseInt(yearMonth.split('-')[0]) : now.getFullYear()
  const m = yearMonth ? parseInt(yearMonth.split('-')[1]) : now.getMonth() + 1
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`
  const endDate = lastDayOfMonth(y, m)

  const { data } = await service
    .from('attendance_records')
    .select('*, user:users!attendance_records_user_id_fkey(display_name, email, department:departments(name))')
    .gte('clock_date', startDate)
    .lte('clock_date', endDate)
    .order('clock_date')
    .order('user_id')

  const formatTime = (t: string | null) => {
    if (!t) return ''
    return new Date(t).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Taipei' })
  }

  const rows = (data ?? []).map((r: AttendanceExportRow) => {
    const u = Array.isArray(r.user) ? r.user[0] : r.user
    const dept = Array.isArray(u?.department) ? u.department[0] : u?.department
    return {
      '日期': r.clock_date,
      '員工': u?.display_name ?? '',
      '部門': dept?.name ?? '',
      '上班打卡': formatTime(r.clock_in),
      '下班打卡': formatTime(r.clock_out),
      '自動上班': r.is_auto_in ? '是' : '',
      '自動下班': r.is_auto_out ? '是' : '',
      '備註': r.note ?? '',
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, `出勤紀錄`)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="attendance_${yearMonth ?? 'export'}.xlsx"`,
    },
  })
}
