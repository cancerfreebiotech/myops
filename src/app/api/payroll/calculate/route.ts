import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { lastDayOfMonth } from '@/lib/date-utils'

// T48: Payroll auto-calculation API
// Generates draft payroll records for all active TW full-time employees
export async function POST(request: NextRequest) {
  const service = await createServiceClient()

  // Support both user auth and cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Called by cron — proceed without user auth
  } else {
    const supabase = await createClient()
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
  }

  const body = await request.json()
  const year = body.year ?? new Date().getFullYear()
  const month = body.month ?? new Date().getMonth() + 1

  // 1. Get all active TW employees with profiles
  const { data: employees } = await service
    .from('users')
    .select('id, display_name, employment_type, work_region')
    .eq('is_active', true)
    .eq('work_region', 'TW')
    .eq('employment_type', 'full_time')

  if (!employees?.length) {
    return NextResponse.json({ data: { generated: 0, message: '無符合條件的員工' } })
  }

  const userIds = employees.map(e => e.id)

  // 2. Get user profiles (salary info)
  const { data: profiles } = await service
    .from('user_profiles')
    .select('user_id, monthly_salary, hourly_rate, labor_pension_self')
    .in('user_id', userIds)

  const profileMap = new Map(profiles?.map(p => [p.user_id, p]) ?? [])

  // 3. Get approved overtime for the month
  const { data: overtimeRecords } = await service
    .from('overtime_requests')
    .select('user_id, hours, overtime_rate_id')
    .in('user_id', userIds)
    .in('status', ['approved', 'coo_approved', 'lead_approved'])
    .gte('ot_date', `${year}-${String(month).padStart(2, '0')}-01`)
    .lte('ot_date', `${lastDayOfMonth(year, month)}`)

  // 4. Get overtime rates
  const { data: rates } = await service
    .from('overtime_rates')
    .select('id, rate')

  const rateMap = new Map(rates?.map(r => [r.id, Number(r.rate)]) ?? [])

  // 5. Get unpaid leave days (salary_ratio = 0)
  const { data: leaveRequests } = await service
    .from('leave_requests')
    .select('user_id, total_days, leave_type_id')
    .in('user_id', userIds)
    .eq('status', 'approved')
    .gte('start_date', `${year}-${String(month).padStart(2, '0')}-01`)
    .lte('start_date', `${lastDayOfMonth(year, month)}`)

  const { data: leaveTypes } = await service
    .from('leave_types')
    .select('id, salary_ratio')

  const leaveTypeMap = new Map(leaveTypes?.map(lt => [lt.id, Number(lt.salary_ratio)]) ?? [])

  // 6. Get insurance brackets for this year
  const { data: laborBrackets } = await service
    .from('labor_insurance_brackets')
    .select('insured_salary, employee_share, employer_share')
    .eq('effective_year', year)
    .order('insured_salary', { ascending: true })

  const { data: healthBrackets } = await service
    .from('health_insurance_brackets')
    .select('insured_salary, employee_share, employer_share')
    .eq('effective_year', year)
    .order('insured_salary', { ascending: true })

  // 7. Get bonuses for the month
  const { data: bonusRecords } = await service
    .from('bonus_records')
    .select('user_id, amount')
    .eq('year', year)
    .eq('month', month)

  // Helper: find bracket
  function findBracket(brackets: any[] | null, salary: number) {
    if (!brackets?.length) return { employee_share: 0, employer_share: 0 }
    for (let i = brackets.length - 1; i >= 0; i--) {
      if (salary >= Number(brackets[i].insured_salary)) return brackets[i]
    }
    return brackets[0]
  }

  // 8. Build payroll records
  const records: any[] = []
  let generated = 0

  for (const emp of employees) {
    const profile = profileMap.get(emp.id)
    const baseSalary = Number(profile?.monthly_salary ?? 0)
    if (baseSalary === 0) continue

    // Calculate overtime pay
    const empOT = overtimeRecords?.filter(o => o.user_id === emp.id) ?? []
    let overtimePay = 0
    for (const ot of empOT) {
      const rate = rateMap.get(ot.overtime_rate_id) ?? 1.34
      const hourlyBase = baseSalary / 30 / 8
      overtimePay += hourlyBase * rate * Number(ot.hours)
    }

    // Calculate unpaid leave deduction
    const empLeaves = leaveRequests?.filter(l => l.user_id === emp.id) ?? []
    let unpaidLeaveDays = 0
    for (const leave of empLeaves) {
      const ratio = leaveTypeMap.get(leave.leave_type_id) ?? 1
      if (ratio === 0) unpaidLeaveDays += Number(leave.total_days)
    }
    const unpaidLeaveDeduct = (baseSalary / 30) * unpaidLeaveDays

    // Bonus
    const empBonuses = bonusRecords?.filter(b => b.user_id === emp.id) ?? []
    const bonus = empBonuses.reduce((sum, b) => sum + Number(b.amount), 0)

    // Insurance
    const laborBracket = findBracket(laborBrackets, baseSalary)
    const healthBracket = findBracket(healthBrackets, baseSalary)

    const laborIns = Number(laborBracket.employee_share ?? 0)
    const healthIns = Number(healthBracket.employee_share ?? 0)
    const pensionSelfRate = Number(profile?.labor_pension_self ?? 0) / 100
    const laborPensionSelf = Math.round(baseSalary * pensionSelfRate)

    const grossPay = baseSalary + overtimePay + bonus
    const totalDeduction = unpaidLeaveDeduct + laborIns + healthIns + laborPensionSelf
    const netPay = grossPay - totalDeduction

    records.push({
      user_id: emp.id,
      year,
      month,
      base_salary: Math.round(baseSalary),
      overtime_pay: Math.round(overtimePay),
      bonus: Math.round(bonus),
      other_income: 0,
      unpaid_leave_deduct: Math.round(unpaidLeaveDeduct),
      labor_insurance: Math.round(laborIns),
      health_insurance: Math.round(healthIns),
      labor_pension_self: Math.round(laborPensionSelf),
      other_deduction: 0,
      gross_pay: Math.round(grossPay),
      total_deduction: Math.round(totalDeduction),
      net_pay: Math.round(netPay),
      employer_labor_ins: Math.round(Number(laborBracket.employer_share ?? 0)),
      employer_health_ins: Math.round(Number(healthBracket.employer_share ?? 0)),
      employer_pension: Math.round(baseSalary * 0.06), // 6% employer contribution
      status: 'draft',
    })
  }

  // 9. Upsert (avoid duplicates)
  for (const rec of records) {
    const { error } = await service
      .from('payroll_records')
      .upsert(rec, { onConflict: 'user_id,year,month' })
    if (!error) generated++
  }

  return NextResponse.json({ data: { generated, total: records.length } })
}
