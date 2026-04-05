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

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'hr'].includes(currentUser?.role ?? '')) redirect('/')

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

  return (
    <div>
      <PageHeader title={t('adminLeaveBalances')} description={`${currentYear} 年度員工假別額度`} />
      <LeaveBalancesManager
        users={users ?? []}
        leaveTypes={leaveTypes ?? []}
        balances={balances ?? []}
        year={currentYear}
      />
    </div>
  )
}
