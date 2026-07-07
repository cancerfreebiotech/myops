import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { LeaveTypesManager } from './LeaveTypesManager'

export default async function LeaveTypesPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.job_role === 'hr_manager'
  const isCOO = currentUser?.job_role === 'coo'
  if (!isAdmin && !isHR && !isCOO) redirect('/no-permission')

  // leave_types 真實欄位為 name_zh/applicable_to/salary_ratio/...，映射成 LeaveTypesManager 期望的形狀
  const { data: rawTypes } = await service
    .from('leave_types')
    .select('id, name_zh, applicable_to, salary_ratio, default_quota_days, advance_days, is_active')
    .order('sort_order')

  const leaveTypes = (rawTypes ?? []).map(r => ({
    id: r.id,
    name: r.name_zh,
    applies_to: r.applicable_to,
    pay_rate: r.salary_ratio >= 1 ? 'full' : r.salary_ratio > 0 ? 'half' : 'none',
    max_days_per_year: r.default_quota_days,
    advance_days_required: r.advance_days,
    is_active: r.is_active,
  }))

  const t = await getTranslations('nav')
  const tAdmin = await getTranslations('admin.leaveTypes')

  return (
    <div>
      <PageHeader title={t('adminLeaveTypes')} description={tAdmin('description')} />
      <LeaveTypesManager leaveTypes={leaveTypes} />
    </div>
  )
}
