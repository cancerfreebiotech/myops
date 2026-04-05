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

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'hr'].includes(currentUser?.role ?? '')) redirect('/')

  const { data: rates } = await service.from('overtime_rates').select('*').order('ot_type')

  const t = await getTranslations('nav')

  return (
    <div>
      <PageHeader title={t('adminOvertimeRates')} description="各類加班費率設定" />
      <OvertimeRatesManager rates={rates ?? []} />
    </div>
  )
}
