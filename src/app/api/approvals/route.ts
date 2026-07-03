import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// GET /api/approvals — 彙總「待我審批」的項目（採購另由 client 呼叫 /api/procurement/inbox）
export async function GET() {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: me } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  const isAdmin = me?.role === 'admin'
  const feats = (me?.granted_features as string[] | null) ?? []
  const has = (f: string) => isAdmin || feats.includes(f)

  // 各模組沿用其既有的「待我審核」規則
  const leaveQuery = () => {
    let q = supabase
      .from('leave_requests')
      .select('id, start_date, end_date, total_days, reason, user:users!leave_requests_user_id_fkey(display_name), leave_type:leave_types(name)')
      .eq('status', 'pending')
    if (!isAdmin && !feats.includes('hr_manager')) q = q.eq('approver_id', user.id)
    return q
  }

  const overtimeQuery = () => {
    let q = supabase
      .from('overtime_requests')
      .select('id, ot_date, total_hours, reason, user:users!overtime_requests_user_id_fkey(display_name)')
      .eq('status', 'pending')
    if (!isAdmin) q = q.eq('approver_id', user.id)
    return q
  }

  const tripsQuery = () => {
    let q = supabase
      .from('business_trips')
      .select('id, destination, purpose, start_date, end_date, user:users!business_trips_user_id_fkey(display_name)')
      .eq('status', 'pending')
    if (!isAdmin && !feats.includes('hr_manager')) q = q.eq('approver_id', user.id)
    return q
  }

  const makeupQuery = () => {
    let q = supabase
      .from('attendance_makeup_requests')
      .select('id, clock_date, clock_type, clock_time, reason, user:users!attendance_makeup_requests_user_id_fkey(display_name)')
      .eq('status', 'pending')
    if (!isAdmin) q = q.eq('approver_id', user.id)
    return q
  }

  // 薪資：依目前狀態對應「輪到誰」
  const payrollStages: string[] = []
  if (isAdmin) payrollStages.push('draft', 'coo_approved')
  if (has('confirm_payroll')) payrollStages.push('hr_reviewed')
  if (has('approve_payroll')) payrollStages.push('finance_confirmed')

  const [leave, overtime, makeup, trips, documents, payroll, expenses] = await Promise.all([
    leaveQuery(),
    overtimeQuery(),
    makeupQuery(),
    tripsQuery(),
    has('approve_contract')
      ? supabase
          .from('documents')
          .select('id, title, doc_type, created_at, uploader:users!documents_uploaded_by_fkey(display_name)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    payrollStages.length
      ? supabase
          .from('payroll_records')
          .select('id, year, month, status, user:users!payroll_records_user_id_fkey(display_name)')
          .in('status', payrollStages)
      : Promise.resolve({ data: [], error: null }),
    has('expense_approve')
      ? supabase
          .from('expense_claims')
          .select('id, expense_date, category, amount, currency, description, status, user:users!expense_claims_user_id_fkey(display_name)')
          .in('status', ['pending', 'approved'])
          .order('expense_date', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  return NextResponse.json({
    data: {
      leave: leave.data ?? [],
      overtime: overtime.data ?? [],
      makeup: makeup.data ?? [],
      trips: trips.data ?? [],
      documents: documents.data ?? [],
      payroll: payroll.data ?? [],
      expenses: expenses.data ?? [],
    },
  })
}
