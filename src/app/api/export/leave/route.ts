import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// T60: Export leave records as xlsx
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
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  const { data } = await service
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(display_name, email, department:departments(name)),
      leave_type:leave_types!leave_requests_leave_type_id_fkey(name_zh),
      deputy:users!leave_requests_deputy_user_id_fkey(display_name)
    `)
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`)
    .order('start_date', { ascending: false })

  const rows = (data ?? []).map((r: any) => {
    const u = Array.isArray(r.user) ? r.user[0] : r.user
    const dept = Array.isArray(u?.department) ? u.department[0] : u?.department
    const lt = Array.isArray(r.leave_type) ? r.leave_type[0] : r.leave_type
    const deputy = Array.isArray(r.deputy) ? r.deputy[0] : r.deputy
    return {
      '員工': u?.display_name ?? '',
      '部門': dept?.name ?? '',
      '假別': lt?.name_zh ?? '',
      '開始日期': r.start_date,
      '結束日期': r.end_date,
      '天數': r.total_days,
      '職務代理人': deputy?.display_name ?? '',
      '狀態': r.status,
      '原因': r.reason ?? '',
      '申請日期': r.created_at?.split('T')[0] ?? '',
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, `請假紀錄${year}`)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="leave_${year}.xlsx"`,
    },
  })
}
