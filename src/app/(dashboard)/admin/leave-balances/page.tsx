import { createAdminClient, createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { pickBalancesForDate } from '@/lib/leave-balance'
import { taipeiToday } from '@/lib/taipei-date'
import { LeaveBalancesManager } from './LeaveBalancesManager'

export default async function LeaveBalancesPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.job_role === 'hr_manager'
  const isCOO = currentUser?.job_role === 'coo'
  if (!isAdmin && !isHR && !isCOO) redirect('/no-permission')

  const currentYear = new Date().getFullYear()
  const today = taipeiToday()

  const { data: users } = await service
    .from('users')
    .select('id, display_name, employment_type, department:departments(name)')
    .eq('is_active', true)
    .order('display_name')

  // leave_types 實際欄位為 name_zh / applicable_to（無 name / applies_to / deleted_at）——
  // 用 PostgREST alias 對應成元件預期的欄位名，否則整個查詢會 400、假別欄位全部消失，
  // 造成「餘額頁看不到可調整的假別欄位」（Linda 回報：無法調整個人假別餘額）。
  // 加抓 default_quota_days：供固定額度假別（事假/病假/婚假…）在「該員工尚無 balance 列」時
  // 於前端 fallback 顯示應有額度（否則整欄顯示 0，即 Linda 回報的「剩餘天數都顯示0」主因之一）。
  const { data: leaveTypes } = await service
    .from('leave_types')
    .select('id, name:name_zh, applies_to:applicable_to, default_quota_days')
    .eq('is_active', true)
    .order('sort_order')

  // 抓每位員工的全部餘額列，再用 pickBalancesForDate 依「今天」（台北）歸屬解析每個假別當期那一列。
  // 取代原本硬過濾 .eq('year', currentYear)：8–12 月到職者的週年制特休列 year=去年（period 跨年），
  // 會被曆年過濾漏掉而顯示 0（Linda 回報主因之二）。用 admin client 讀（HR 管理頁需讀全員含他人 used_days）。
  const { data: balanceRows } = await createAdminClient()
    .from('leave_balances')
    .select('user_id, leave_type_id, total_days, used_days, period_start, period_end, year')

  type RawBalance = {
    user_id: string; leave_type_id: string; total_days: number
    used_days: number | null; period_start: string | null; period_end: string | null; year: number
  }
  const byUser = new Map<string, RawBalance[]>()
  for (const r of (balanceRows ?? []) as RawBalance[]) {
    const arr = byUser.get(r.user_id) ?? []
    arr.push(r)
    byUser.set(r.user_id, arr)
  }
  const balances = Array.from(byUser.entries()).flatMap(([uid, rows]) =>
    pickBalancesForDate(rows, today).map(p => ({
      user_id: uid,
      leave_type_id: p.leave_type_id,
      allocated_days: p.total_days,
      used_days: p.used_days ?? 0,
      year: p.year,
    }))
  )

  const t = await getTranslations('nav')
  const tp = await getTranslations('admin.leaveBalancesPage')

  return (
    <div>
      <PageHeader title={t('adminLeaveBalances')} description={tp('description', { year: currentYear })} />
      <LeaveBalancesManager
        users={users ?? []}
        leaveTypes={leaveTypes ?? []}
        balances={balances ?? []}
        year={currentYear}
      />
    </div>
  )
}
