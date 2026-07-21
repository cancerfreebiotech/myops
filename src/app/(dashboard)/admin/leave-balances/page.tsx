import { createAdminClient, createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
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

  const { data: users } = await service
    .from('users')
    .select('id, display_name, employment_type, department:departments(name)')
    .eq('is_active', true)
    .order('display_name')

  // leave_types 實際欄位為 name_zh / applicable_to（無 name / applies_to / deleted_at）——
  // 用 PostgREST alias 對應成元件預期的欄位名，否則整個查詢會 400、假別欄位全部消失，
  // 造成「餘額頁看不到可調整的假別欄位」（Linda 回報：無法調整個人假別餘額）。
  const { data: leaveTypes } = await service
    .from('leave_types')
    .select('id, name:name_zh, applies_to:applicable_to')
    .eq('is_active', true)
    .order('sort_order')

  // leave_balances 欄位為 total_days（無 allocated_days）——alias 成元件預期的 allocated_days，
  // 否則格子永遠顯示 0。用 admin client 讀取：這是 HR 管理頁（已於上方 gate），而
  // leave_balances 的 SELECT 政策會讓非 admin 的 HR 只讀得到自己那筆，管理格會誤顯示他人為 0。
  const { data: balances } = await createAdminClient()
    .from('leave_balances')
    .select('user_id, leave_type_id, allocated_days:total_days')
    .eq('year', currentYear)

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
