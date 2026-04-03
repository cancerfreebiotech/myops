import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// T58: Export payroll records as xlsx
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
  const isFinance = currentUser?.granted_features?.includes('finance_payroll')
  if (!isAdmin && !isHR && !isFinance) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null

  let query = service
    .from('payroll_records')
    .select('*, user:users!payroll_records_user_id_fkey(display_name, email, department:departments(name))')
    .eq('year', year)
    .order('month')
    .order('created_at')

  if (month) query = query.eq('month', month)

  const { data } = await query

  const rows = (data ?? []).map((r: any) => {
    const u = Array.isArray(r.user) ? r.user[0] : r.user
    const dept = Array.isArray(u?.department) ? u.department[0] : u?.department
    return {
      '員工': u?.display_name ?? '',
      'Email': u?.email ?? '',
      '部門': dept?.name ?? '',
      '年': r.year,
      '月': r.month,
      '底薪': r.base_salary,
      '加班費': r.overtime_pay,
      '獎金': r.bonus,
      '其他收入': r.other_income,
      '應發合計': r.gross_pay,
      '無薪假扣款': r.unpaid_leave_deduct,
      '勞保': r.labor_insurance,
      '健保': r.health_insurance,
      '勞退自提': r.labor_pension_self,
      '其他扣除': r.other_deduction,
      '扣除合計': r.total_deduction,
      '實發': r.net_pay,
      '狀態': r.status,
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, `薪資${year}${month ? `_${month}月` : ''}`)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="payroll_${year}${month ? `_${month}` : ''}.xlsx"`,
    },
  })
}
