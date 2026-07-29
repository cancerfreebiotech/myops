import { createServiceClient } from '@/lib/supabase/server'
import { lastDayOfMonth } from '@/lib/date-utils'
import { splitOvertimeSegments, weightedOvertimeHours, type OvertimeDayType } from '@/lib/overtime-pay'

// 月薪資草稿產生的核心邏輯。
// 原本這段只存在於 /api/payroll/calculate，而 /api/payroll/generate-monthly
// 是「用 public URL 對自己發一次 HTTP fetch」來重用它 —— 在 serverless 上不可靠
// （冷啟／內網不可達／NEXT_PUBLIC_APP_URL 設錯就整包失敗），又多一次網路往返，
// 還得把 cookie / cron secret 轉發出去。抽成函式後兩支 route 直接共用同一份程式碼。

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
  // 重跑當月會把紀錄覆寫回 draft，簽核軌跡必須一起清掉，
  // 否則會出現「status=draft 卻掛著上一輪的核准人」這種不一致資料。
  hr_reviewed_by: null
  hr_reviewed_at: null
  finance_confirmed_by: null
  finance_confirmed_at: null
  coo_approved_by: null
  coo_approved_at: null
  paid_by: null
  paid_at: null
  rejected_by: null
  rejected_at: null
}

export type PayrollGenerationResult =
  | { kind: 'no_eligible_employees' }
  /** firstError：寫入失敗時的第一個錯誤訊息。原本 upsert 失敗被 `if (!error)` 吃掉，
   *  畫面只會看到「產生 0 筆」而完全查不出原因（例如權限不足）。 */
  | { kind: 'ok'; generated: number; total: number; firstError?: string }

// 計算一筆請假落在 [monthStart, monthEnd] 當月的天數（含頭尾、以日曆天計）。
// 以整段日曆天為分母、當月重疊日曆天為分子，按比例攤 totalDays，
// 與請假端 total_days 的算法（含頭尾日曆天；單日半天=0.5）一致：
// 整段落在當月 → 重疊=整段 → 回傳原 totalDays；完全不重疊 → 0。
const DAY_MS = 86_400_000
function leaveDaysInMonth(
  startDate: string, endDate: string, totalDays: number, monthStart: string, monthEnd: string
): number {
  const s = Date.parse(`${startDate}T00:00:00Z`)
  const e = Date.parse(`${endDate}T00:00:00Z`)
  const ms = Date.parse(`${monthStart}T00:00:00Z`)
  const me = Date.parse(`${monthEnd}T00:00:00Z`)
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0
  const spanDays = Math.round((e - s) / DAY_MS) + 1
  const os = Math.max(s, ms)
  const oe = Math.min(e, me)
  if (oe < os) return 0
  const overlapDays = Math.round((oe - os) / DAY_MS) + 1
  return totalDays * (overlapDays / spanDays)
}

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

// T48: Payroll auto-calculation
// Generates draft payroll records for all active TW full-time employees
export async function generatePayrollDrafts(year: number, month: number): Promise<PayrollGenerationResult> {
  const service = await createServiceClient()

  // 1. Get all active TW employees with profiles
  const { data: employees } = await service
    .from('users')
    .select('id, display_name, employment_type, work_region')
    .eq('is_active', true)
    .eq('work_region', 'TW')
    .eq('employment_type', 'full_time')

  if (!employees?.length) {
    return { kind: 'no_eligible_employees' }
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
  // 抓「與當月有重疊」的請假（start_date <= 月底 且 end_date >= 月初），
  // 而非只抓 start_date 落在當月者——否則跨月請假（上月起、延伸到本月）會整段漏算。
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = lastDayOfMonth(year, month)
  const { data: leaveRequests } = await service
    .from('leave_requests')
    .select('user_id, total_days, leave_type_id, start_date, end_date')
    .in('user_id', userIds)
    .eq('status', 'approved')
    .lte('start_date', monthEnd)
    .gte('end_date', monthStart)

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
    // 跨月請假只計入「落在當月」的天數：以請假整段（含頭尾的日曆天）為分母，
    // 當月重疊日曆天為分子，按比例攤 total_days（total_days 由請假端以含頭尾日曆天計，
    // 單日半天則為 0.5，此比例攤法對兩者皆正確）。
    const empLeaves = leaveRequests?.filter(l => l.user_id === emp.id) ?? []
    let unpaidLeaveDays = 0
    for (const leave of empLeaves) {
      const ratio = leaveTypeMap.get(leave.leave_type_id) ?? 1
      if (ratio === 0) {
        unpaidLeaveDays += leaveDaysInMonth(
          leave.start_date, leave.end_date, Number(leave.total_days), monthStart, monthEnd
        )
      }
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
      hr_reviewed_by: null,
      hr_reviewed_at: null,
      finance_confirmed_by: null,
      finance_confirmed_at: null,
      coo_approved_by: null,
      coo_approved_at: null,
      paid_by: null,
      paid_at: null,
      rejected_by: null,
      rejected_at: null,
    })
  }

  // 9. Upsert (avoid duplicates)
  let firstError: string | undefined
  for (const rec of records) {
    const { error } = await service
      .from('payroll_records')
      .upsert(rec, { onConflict: 'user_id,year,month' })
    if (error) {
      if (!firstError) firstError = error.message
      console.error('[payroll] upsert failed for user', rec.user_id, error.message)
      continue
    }
    generated++
  }

  return { kind: 'ok', generated, total: records.length, ...(firstError ? { firstError } : {}) }
}
