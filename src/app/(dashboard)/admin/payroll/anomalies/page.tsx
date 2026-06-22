import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnomaliesClient } from './AnomaliesClient'

export default async function PayrollAnomaliesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, job_role, granted_features')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const isFinanceJobRole = currentUser?.job_role === 'finance'
  const isCOO = currentUser?.job_role === 'coo'
  const isHR = currentUser?.granted_features?.includes('hr_manager')
  const isFinance = currentUser?.granted_features?.includes('finance_payroll')
  if (!isAdmin && !isFinanceJobRole && !isCOO && !isHR && !isFinance) redirect('/no-permission')

  const t = await getTranslations('payroll.anomalies')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AnomaliesClient />
    </div>
  )
}
