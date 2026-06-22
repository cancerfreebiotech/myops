import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { OvertimeRatesManager } from './OvertimeRatesManager'

export default async function OvertimeRatesPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.job_role === 'hr_manager'
  const isCOO = currentUser?.job_role === 'coo'
  if (!isAdmin && !isHR && !isCOO) redirect('/no-permission')

  const { data: rates } = await service.from('overtime_rates').select('*').order('ot_type')

  const t = await getTranslations('nav')
  const tAdmin = await getTranslations('admin.overtimeRates')

  return (
    <div>
      <PageHeader title={t('adminOvertimeRates')} description={tAdmin('description')} />
      <OvertimeRatesManager rates={rates ?? []} />
    </div>
  )
}
