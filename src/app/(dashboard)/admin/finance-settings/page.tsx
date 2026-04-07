import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { RoleSettingsSection } from '@/components/admin/RoleSettingsSection'
import { HR_SETTINGS_KEYS, FINANCE_SETTINGS_KEYS, COO_SETTINGS_KEYS } from '@/lib/role-settings'
import { FinanceManagementLinks } from '@/components/admin/FinanceManagementLinks'

export default async function FinanceSettingsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin'
  const isFinance = currentUser?.job_role === 'finance'
  if (!isAdmin && !isFinance) redirect('/')

  const allKeys = [...FINANCE_SETTINGS_KEYS, ...HR_SETTINGS_KEYS, ...COO_SETTINGS_KEYS]
  const { data: rows } = await service
    .from('system_settings')
    .select('key, value')
    .in('key', allKeys)

  const byKey = Object.fromEntries((rows ?? []).map(r => [r.key, r.value ?? '']))
  const pick = (keys: readonly string[]) => keys.map(k => ({ key: k, value: byKey[k] ?? '' }))

  const t = await getTranslations('admin')

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={t('financeSettings.title')} description={t('financeSettings.description')} />
      <RoleSettingsSection title={t('financeSettings.financeSection')} settings={pick(FINANCE_SETTINGS_KEYS)} editable={isAdmin || isFinance} />
      <FinanceManagementLinks editable={isAdmin || isFinance} />
      <RoleSettingsSection title={t('financeSettings.hrSection')} settings={pick(HR_SETTINGS_KEYS)} editable={false} />
      <RoleSettingsSection title={t('financeSettings.cooSection')} settings={pick(COO_SETTINGS_KEYS)} editable={false} />
    </div>
  )
}
