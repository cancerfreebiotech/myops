import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// T59: Export attendance records as xlsx
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.granted_features?.includes('hr_manager')
  if (!isAdmin && !isHR) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const yearMonth = searchParams.get('month') // format: 2026-04
  const startDate = yearMonth ? `${yearMonth}-01` : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  const endDate = yearMonth ? `${yearMonth}-31` : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-31`

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

  const rows = (data ?? []).map((r: any) => {
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
