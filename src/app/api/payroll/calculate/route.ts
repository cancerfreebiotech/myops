import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { lastDayOfMonth } from '@/lib/date-utils'
import { splitOvertimeSegments, weightedOvertimeHours, type OvertimeDayType } from '@/lib/overtime-pay'

interface InsuranceBracket {
  insured_salary: number
  employee_share: number
  employer_share: number
}

interface PayrollRecordInsert {
  user_id: string
  year: number
  month: number
  base_salary: number
  overtime_pay: number
  bonus: number
  other_income: number
  unpaid_leave_deduct: number
  labor_insurance: number
  health_insurance: number
  labor_pension_self: number
  other_deduction: number
  gross_pay: number
  total_deduction: number
  net_pay: number
  employer_labor_ins: number
  employer_health_ins: number
  employer_pension: number
  status: string
}

// T48: Payroll auto-calculation API
// Generates draft payroll records for all active TW full-time employees
export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const service = await createServiceClient()

  // Support both user auth and cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Called by cron — proceed without user auth
  } else {
    const supabase = await createClient()
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
    return NextResponse.json({ data: { generated: 0, message: t('payrollCalculate.noEligibleEmployees') } })
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
    .select('user_id, hours, day_type, ot_date, start_time, end_time')
    .in('user_id', userIds)
    .in('status', ['approved', 'coo_approved', 'lead_approved'])
    .gte('ot_date', `${year}-${String(month).padStart(2, '0')}-01`)
    .lte('ot_date', `${lastDayOfMonth(year, month)}`)

  // 4. Get overtime rates（依 tier_key 分段對應；查無時 weightedOvertimeHours 退回法定倍率）
  const { data: rates } = await service
    .from('overtime_rates')
    .select('tier_key, rate')

  const tierRateMap = new Map(
    (rates ?? []).filter(r => r.tier_key).map(r => [r.tier_key as string, Number(r.rate)])
  )

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

  // Helper: 投保級距＝「涵蓋薪資的級距」——insured_salary（投保金額）為級距上限，
  // 取 insured_salary >= 實際薪資的最低級距（而非 floor <= salary 的最高級距，
  // 後者會把跨級距薪資投保在較低級距、少扣保費）。薪資超過最高級距 → 用最高級距。
  function findBracket(brackets: InsuranceBracket[] | null, salary: number) {
    if (!brackets?.length) return { employee_share: 0, employer_share: 0 }
    const asc = [...brackets].sort((a, b) => Number(a.insured_salary) - Number(b.insured_salary))
    for (const b of asc) {
      if (Number(b.insured_salary) >= salary) return b
    }
    return asc[asc.length - 1]
  }

  // 8. Build payroll records
  const records: PayrollRecordInsert[] = []
  let generated = 0

  for (const emp of employees) {
    const profile = profileMap.get(emp.id)
    const baseSalary = Number(profile?.monthly_salary ?? 0)
    if (baseSalary === 0) continue

    // Calculate overtime pay（勞基法 §24/§39 依日別分段：平日前2h×1.34/後2h×1.67、
    // 休息日 2h/2-8h/8h+ 三段、國定假日 ×2；倍率可由 overtime_rates 調整）。
    // 跨午夜且跨日別（如週五 22:00–02:00）依午夜切段，各段套當日日別計價。
    const empOT = overtimeRecords?.filter(o => o.user_id === emp.id) ?? []
    let overtimePay = 0
    const hourlyBase = baseSalary / 30 / 8
    for (const ot of empOT) {
      const dayType = (ot.day_type ?? 'weekday') as OvertimeDayType
      const segments = (ot.ot_date && ot.start_time && ot.end_time)
        ? splitOvertimeSegments(dayType, ot.ot_date, ot.start_time, ot.end_time)
        : [{ dayType, hours: Number(ot.hours) }]
      for (const seg of segments) {
        overtimePay += hourlyBase * weightedOvertimeHours(seg.dayType, seg.hours, k => tierRateMap.get(k))
      }
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
