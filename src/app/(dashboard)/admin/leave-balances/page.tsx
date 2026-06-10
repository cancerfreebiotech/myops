import { createClient, createServiceClient } from '@/lib/supabase/server'
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
  if (!isAdmin && !isHR && !isCOO) redirect('/')

  const currentYear = new Date().getFullYear()

  const { data: users } = await service
    .from('users')
    .select('id, display_name, employment_type, department:departments(name)')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('display_name')

  const { data: leaveTypes } = await service
    .from('leave_types')
    .select('id, name, applies_to')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name')

  const { data: balances } = await service
    .from('leave_balances')
    .select('*')
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
