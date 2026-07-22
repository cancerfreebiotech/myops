import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { LeaveClient, type LeaveRequest } from './LeaveClient'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { pickBalancesForDate } from '@/lib/leave-balance'

export default async function LeavePage() {
  const t = await getTranslations('leave')
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, granted_features, employment_type, department_id, manager_id, display_name')
    .eq('id', user.id)
    .single()

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'leave')) redirect('/no-permission')

  // 全站慣例：HR = admin 或 granted_features 含 'hr_manager'（role 的 CHECK 僅 member/admin）
  const isHR = currentUser?.role === 'admin'
    || ((currentUser?.granted_features as string[] | null) ?? []).includes('hr_manager')

  // Leave types available to this user
  const empType = currentUser?.employment_type ?? 'full_time'
  const { data: leaveTypes } = await service
    .from('leave_types')
    .select('id, name:name_zh, applies_to:applicable_to, pay_rate:salary_ratio, max_days_per_year:default_quota_days, advance_days_required:advance_days, requires_qualification, is_active')
    .eq('is_active', true)
    .in('applicable_to', empType === 'intern' ? ['all', 'intern'] : ['all', 'full_time'])
    .order('sort_order')

  // Leave balances（leave_balances 無 allocated_days/remaining_days，以 total_days/used_days 換算）；
  // 特休採週年制（period_start/period_end），其餘假別採曆年 → 依「今天」(台北) 解析每個假別的當期餘額。
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
  const { data: allBalances } = await service
    .from('leave_balances')
    .select(`*, leave_type:leave_types(name:name_zh)`)
    .eq('user_id', user.id)

  const mappedBalances = pickBalancesForDate(allBalances ?? [], today).map(b => ({
    ...b,
    allocated_days: Number(b.total_days ?? 0),
    remaining_days: Number(b.total_days ?? 0) - Number(b.used_days ?? 0),
  }))

  // Potential deputy approvers (same department)
  // 使用者無 department_id 時直接視為空陣列，避免送出 department_id=eq.(空字串) 400
  let colleagues: { id: string; display_name: string | null }[] | null = []
  if (currentUser?.department_id) {
    const { data } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('department_id', currentUser.department_id)
      .eq('is_active', true)
      .neq('id', user.id)
      .order('display_name')
    colleagues = data
  }

  // 待審清單（leave_requests 無 approver_id）：
  // - HR/admin：全公司 pending（排除自己的單，職責分離）
  // - manager：其直屬部屬（users.manager_id = 自己）的 pending
  const approvalSelect = `*, user:users!leave_requests_user_id_fkey(id, display_name), leave_type:leave_types(name:name_zh)`
  let pendingApprovals: LeaveRequest[] = []
  if (isHR) {
    const { data } = await service
      .from('leave_requests')
      .select(approvalSelect)
      .eq('status', 'pending')
      .neq('user_id', user.id)
      .order('created_at', { ascending: false })
    pendingApprovals = data ?? []
  } else {
    // 主管靠 users.manager_id = 自己 判定（role 無 'manager' 死值）；
    // 非主管者部屬清單為空，pendingApprovals 維持 []。
    const { data: reports } = await service.from('users').select('id').eq('manager_id', user.id)
    const reportIds = (reports ?? []).map(r => r.id)
    if (reportIds.length > 0) {
      const { data } = await service
        .from('leave_requests')
        .select(approvalSelect)
        .in('user_id', reportIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      pendingApprovals = data ?? []
    }
  }

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <LeaveClient
        currentUser={currentUser}
        leaveTypes={leaveTypes ?? []}
        balances={mappedBalances}
        colleagues={colleagues ?? []}
        pendingApprovals={pendingApprovals}
        isHR={isHR}
      />
    </div>
  )
}
