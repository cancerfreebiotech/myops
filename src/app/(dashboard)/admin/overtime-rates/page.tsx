import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
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

  // overtime_rates 真實欄位為 name_zh/name_en/name_ja/rate（無 ot_type/multiplier/is_active），映射成元件期望的形狀
  const locale = await getLocale()
  const { data: rawRates } = await service
    .from('overtime_rates')
    .select('id, name_zh, name_en, name_ja, rate')
    .order('sort_order')

  const rates = (rawRates ?? []).map(r => ({
    id: r.id,
    ot_type: locale === 'en' ? r.name_en : locale === 'ja' ? r.name_ja : r.name_zh,
    multiplier: r.rate,
  }))

  const t = await getTranslations('nav')
  const tAdmin = await getTranslations('admin.overtimeRates')

  return (
    <div>
      <PageHeader title={t('adminOvertimeRates')} description={tAdmin('description')} />
      <OvertimeRatesManager rates={rates} />
    </div>
  )
}
