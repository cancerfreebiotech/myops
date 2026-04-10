import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { RoleSettingsSection } from '@/components/admin/RoleSettingsSection'
import { InsuranceBracketsClient } from '@/app/(dashboard)/admin/insurance-brackets/InsuranceBracketsClient'
import { AnomaliesClient } from '@/app/(dashboard)/admin/payroll/anomalies/AnomaliesClient'
import { FINANCE_SETTINGS_KEYS } from '@/lib/role-settings'

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">{label}</h2>
    </div>
  )
}

export default async function FinanceSettingsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin'
  const isFinance = currentUser?.job_role === 'finance'
  const isCOO = currentUser?.job_role === 'coo'
  if (!isAdmin && !isFinance && !isCOO) redirect('/')

  const editable = isAdmin || isFinance

  const { data: rows } = await service
    .from('system_settings')
    .select('key, value')
    .in('key', [...FINANCE_SETTINGS_KEYS])

  const byKey = Object.fromEntries((rows ?? []).map(r => [r.key, r.value ?? '']))
  const pick = (keys: readonly string[]) => keys.map(k => ({ key: k, value: byKey[k] ?? '' }))

  const { data: laborBrackets } = await service
    .from('labor_insurance_brackets')
    .select('*')
    .order('effective_year', { ascending: false })
    .order('grade', { ascending: true })

  const { data: healthBrackets } = await service
    .from('health_insurance_brackets')
    .select('*')
    .order('effective_year', { ascending: false })
    .order('grade', { ascending: true })

  const t = await getTranslations('admin')
  const tNav = await getTranslations('nav')

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={t('financeSettings.title')} description={t('financeSettings.description')} />
      <RoleSettingsSection title={t('financeSettings.financeSection')} settings={pick(FINANCE_SETTINGS_KEYS)} editable={editable} />

      <SectionHeader label={tNav('adminInsuranceBrackets')} />
      <InsuranceBracketsClient initialLaborBrackets={laborBrackets ?? []} initialHealthBrackets={healthBrackets ?? []} readOnly={!editable} />

      <SectionHeader label={tNav('adminPayrollAnomalies')} />
      <AnomaliesClient />
    </div>
  )
}
