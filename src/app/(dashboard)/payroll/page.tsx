import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { PayrollClient } from './PayrollClient'

export default async function PayrollPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, granted_features, display_name')
    .eq('id', user.id)
    .single()

  const isHR = currentUser?.role === 'admin' || currentUser?.role === 'hr'
  const canViewPayroll = isHR || currentUser?.granted_features?.includes('view_payroll')
  const canConfirmPayroll = currentUser?.granted_features?.includes('confirm_payroll') || currentUser?.role === 'admin'
  const canApprovePayroll = currentUser?.granted_features?.includes('approve_payroll') || currentUser?.role === 'admin'

  // Current month records
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  let payrollRecords: any[] = []
  if (canViewPayroll) {
    const { data } = await service
      .from('payroll_records')
      .select(`*, user:users!payroll_records_user_id_fkey(id, display_name, department:departments(name))`)
      .eq('year', year)
      .eq('month', month)
      .order('created_at', { ascending: false })
    payrollRecords = data ?? []
  }

  // My own payslips
  const { data: myPayslips } = await supabase
    .from('payroll_records')
    .select(`*, user:users!payroll_records_user_id_fkey(id, display_name)`)
    .eq('user_id', user.id)
    .in('status', ['paid', 'coo_approved'])
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(12)

  const { data: allUsers } = isHR ? await service
    .from('users')
    .select('id, display_name, department:departments(name)')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('display_name') : { data: [] }

  const t = await getTranslations('payroll')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <PayrollClient
        currentUser={currentUser}
        payrollRecords={payrollRecords}
        myPayslips={myPayslips ?? []}
        allUsers={allUsers ?? []}
        isHR={isHR}
        canViewPayroll={canViewPayroll}
        canConfirmPayroll={canConfirmPayroll}
        canApprovePayroll={canApprovePayroll}
        currentYear={year}
        currentMonth={month}
      />
    </div>
  )
}
