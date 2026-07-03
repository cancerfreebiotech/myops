import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { taipeiToday } from '@/lib/taipei-date'

// GET /api/insights — 營運儀表板聚合（admin 限定）
// 公司規模小，直接撈原始列在 JS 聚合
export async function GET() {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const today = taipeiToday()
  const year = today.slice(0, 4)
  const yearStart = `${year}-01-01`
  // 近 6 個月（含當月）
  const now = new Date(`${today}T00:00:00+08:00`)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const rangeStart = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`

  const [ot, attendance, leaves, prs, expenses] = await Promise.all([
    supabase
      .from('overtime_requests')
      .select('ot_date, total_hours, project:projects(name)')
      .eq('status', 'approved')
      .gte('ot_date', rangeStart),
    supabase
      .from('attendance_records')
      .select('clock_date, user_id')
      .gte('clock_date', rangeStart),
    supabase
      .from('leave_requests')
      .select('total_days, leave_type:leave_types(name)')
      .eq('status', 'approved')
      .gte('start_date', yearStart),
    supabase
      .from('purchase_requests')
      .select('created_at, total_amount, status')
      .gte('created_at', `${rangeStart}T00:00:00Z`),
    supabase
      .from('expense_claims')
      .select('expense_date, category, amount, status')
      .in('status', ['approved', 'paid'])
      .gte('expense_date', yearStart),
  ])

  type OtRow = { ot_date: string; total_hours: number; project: { name: string } | null }
  type PrRow = { created_at: string; total_amount: number | null; status: string }

  // 月度 key 清單（近 6 月）
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthlyOT = months.map(m => ({
    month: m,
    hours: ((ot.data ?? []) as unknown as OtRow[])
      .filter(r => r.ot_date.startsWith(m))
      .reduce((sum, r) => sum + Number(r.total_hours ?? 0), 0),
  }))

  const monthlyAttendance = months.map(m => ({
    month: m,
    days: (attendance.data ?? []).filter(r => r.clock_date.startsWith(m)).length,
  }))

  const monthlyProcurement = months.map(m => ({
    month: m,
    amount: ((prs.data ?? []) as unknown as PrRow[])
      .filter(r => r.created_at.startsWith(m) && !['cancelled', 'voided', 'rejected'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0),
  }))

  const leaveByType: Record<string, number> = {}
  for (const r of (leaves.data ?? []) as unknown as { total_days: number; leave_type: { name: string } | null }[]) {
    const name = r.leave_type?.name ?? '—'
    leaveByType[name] = (leaveByType[name] ?? 0) + Number(r.total_days ?? 0)
  }

  const expenseByCategory: Record<string, number> = {}
  for (const r of expenses.data ?? []) {
    expenseByCategory[r.category] = (expenseByCategory[r.category] ?? 0) + Number(r.amount ?? 0)
  }

  const otByProject: Record<string, number> = {}
  for (const r of (ot.data ?? []) as unknown as OtRow[]) {
    const name = r.project?.name ?? '—'
    otByProject[name] = (otByProject[name] ?? 0) + Number(r.total_hours ?? 0)
  }

  return NextResponse.json({
    data: {
      months,
      monthlyOT,
      monthlyAttendance,
      monthlyProcurement,
      leaveByType,
      expenseByCategory,
      otByProject,
      year,
    },
  })
}
