import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { RoleSettingsSection } from '@/components/admin/RoleSettingsSection'
import { LeaveTypesManager } from '@/app/(dashboard)/admin/leave-types/LeaveTypesManager'
import { LeaveBalancesManager } from '@/app/(dashboard)/admin/leave-balances/LeaveBalancesManager'
import { OvertimeRatesManager } from '@/app/(dashboard)/admin/overtime-rates/OvertimeRatesManager'
import { AnomaliesClient, type AnomalyUser } from '@/app/(dashboard)/admin/attendance-anomalies/AnomaliesClient'
import { BonusClient } from '@/app/(dashboard)/admin/bonuses/BonusClient'
import { HR_SETTINGS_KEYS } from '@/lib/role-settings'

function getThirtyDaysAgoStr() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">{label}</h2>
    </div>
  )
}

export default async function HRSettingsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.job_role === 'hr_manager'
  const isCOO = currentUser?.job_role === 'coo'
  if (!isAdmin && !isHR && !isCOO) redirect('/no-permission')

  const editable = isAdmin || isHR

  // HR settings values
  const { data: rows } = await service
    .from('system_settings')
    .select('key, value')
    .in('key', [...HR_SETTINGS_KEYS])

  const byKey = Object.fromEntries((rows ?? []).map(r => [r.key, r.value ?? '']))
  const pick = (keys: readonly string[]) => keys.map(k => ({ key: k, value: byKey[k] ?? '' }))

  // Leave types（真實欄位 name_zh/applicable_to/salary_ratio/...，映射成 LeaveTypesManager 期望的形狀）
  const locale = await getLocale()
  const { data: rawLeaveTypes } = await service
    .from('leave_types')
    .select('id, name_zh, applicable_to, salary_ratio, default_quota_days, advance_days, is_active')
    .order('sort_order')

  const leaveTypes = (rawLeaveTypes ?? []).map(r => ({
    id: r.id,
    name: r.name_zh,
    applies_to: r.applicable_to,
    pay_rate: r.salary_ratio >= 1 ? 'full' : r.salary_ratio > 0 ? 'half' : 'none',
    max_days_per_year: r.default_quota_days,
    advance_days_required: r.advance_days,
    is_active: r.is_active,
  }))

  // Overtime rates（真實欄位 name_zh/name_en/name_ja/rate，映射成 OvertimeRatesManager 期望的形狀）
  const { data: rawRates } = await service
    .from('overtime_rates')
    .select('id, name_zh, name_en, name_ja, rate')
    .order('sort_order')

  const rates = (rawRates ?? []).map(r => ({
    id: r.id,
    ot_type: locale === 'en' ? r.name_en : locale === 'ja' ? r.name_ja : r.name_zh,
    multiplier: r.rate,
  }))

  // Leave balances
  const currentYear = new Date().getFullYear()
  const { data: leaveUsers } = await service
    .from('users')
    .select('id, display_name, employment_type, department:departments(name)')
    .eq('is_active', true)
    .order('display_name')

  const { data: leaveTypesForBalance } = await service
    .from('leave_types')
    .select('id, name:name_zh, applies_to:applicable_to')
    .eq('is_active', true)
    .order('sort_order')

  const { data: balances } = await service
    .from('leave_balances')
    .select('*')
    .eq('year', currentYear)

  // Attendance anomalies computation
  const thirtyDaysAgo = getThirtyDaysAgoStr()
  const { data: autoRecords } = await service
    .from('attendance_records')
    .select(`
      user_id, clock_date, is_auto_in, is_auto_out,
      user:users!attendance_records_user_id_fkey(id, display_name, employment_type, department:departments(name))
    `)
    .gte('clock_date', thirtyDaysAgo)
    .is('voided_at', null) // 異常統計排除已作廢紀錄
    .or('is_auto_in.eq.true,is_auto_out.eq.true')
    .order('clock_date', { ascending: false })

  const userAutoMap: Record<string, { user: AnomalyUser | null; dates: string[] }> = {}
  for (const r of autoRecords ?? []) {
    if (!userAutoMap[r.user_id]) userAutoMap[r.user_id] = { user: r.user as unknown as AnomalyUser | null, dates: [] }
    userAutoMap[r.user_id].dates.push(r.clock_date)
  }
  const anomalies = Object.values(userAutoMap)
    .filter(({ dates }) => dates.length >= 3)
    .map(({ user, dates }) => ({ user, auto_days: dates.length, recent_dates: dates.slice(0, 5) }))
    .sort((a, b) => b.auto_days - a.auto_days)

  const monthStart = new Date()
  monthStart.setDate(1)
  const monthStartStr = monthStart.toISOString().split('T')[0]
  const { data: internMissed } = await service
    .from('attendance_records')
    .select(`user_id, clock_date, user:users!attendance_records_user_id_fkey(id, display_name, employment_type)`)
    .gte('clock_date', monthStartStr)
    .is('voided_at', null) // 異常統計排除已作廢紀錄
    .or('clock_in.is.null,clock_out.is.null')
    .eq('user.employment_type', 'intern')

  const internMap: Record<string, { user: AnomalyUser | null; missed: number }> = {}
  for (const r of internMissed ?? []) {
    const u = Array.isArray(r.user) ? r.user[0] : r.user
    if (u?.employment_type !== 'intern') continue
    if (!internMap[r.user_id]) internMap[r.user_id] = { user: r.user as unknown as AnomalyUser | null, missed: 0 }
    internMap[r.user_id].missed++
  }
  const internAnomalies = Object.values(internMap).filter(({ missed }) => missed > 3)

  // Bonuses
  const { data: bonuses } = await service
    .from('bonus_records')
    .select('*, user:users!bonus_records_user_id_fkey(id, display_name)')
    .eq('year', currentYear)
    .order('created_at', { ascending: false })

  const { data: allUsers } = await service
    .from('users')
    .select('id, display_name')
    .eq('is_active', true)
    .order('display_name')

  const t = await getTranslations('admin')
  const tNav = await getTranslations('nav')

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={t('hrSettings.title')} description={t('hrSettings.description')} />

      <RoleSettingsSection title={t('hrSettings.hrSection')} settings={pick(HR_SETTINGS_KEYS)} editable={editable} />

      <SectionHeader label={tNav('adminLeaveTypes')} />
      <LeaveTypesManager leaveTypes={leaveTypes ?? []} readOnly={!editable} />

      <SectionHeader label={tNav('adminLeaveBalances')} />
      <LeaveBalancesManager
        users={leaveUsers ?? []}
        leaveTypes={leaveTypesForBalance ?? []}
        balances={balances ?? []}
        year={currentYear}
        readOnly={!editable}
      />

      <SectionHeader label={tNav('adminOvertimeRates')} />
      <OvertimeRatesManager rates={rates ?? []} readOnly={!editable} />

      <SectionHeader label={tNav('adminAttendanceAnomalies')} />
      <AnomaliesClient anomalies={anomalies} internAnomalies={internAnomalies} />

      <SectionHeader label={tNav('adminBonuses')} />
      <BonusClient
        initialBonuses={bonuses ?? []}
        allUsers={allUsers ?? []}
        currentYear={currentYear}
        readOnly={!editable}
      />
    </div>
  )
}
