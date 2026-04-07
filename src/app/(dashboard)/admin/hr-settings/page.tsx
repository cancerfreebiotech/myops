import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { RoleSettingsSection } from '@/components/admin/RoleSettingsSection'
import { HR_SETTINGS_KEYS, FINANCE_SETTINGS_KEYS, COO_SETTINGS_KEYS } from '@/lib/role-settings'

export default async function HRSettingsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, granted_features').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.granted_features?.includes('hr_manager')
  if (!isAdmin && !isHR) redirect('/')

  const allKeys = [...HR_SETTINGS_KEYS, ...FINANCE_SETTINGS_KEYS, ...COO_SETTINGS_KEYS]
  const { data: rows } = await service
    .from('system_settings')
    .select('key, value')
    .in('key', allKeys)

  const byKey = Object.fromEntries((rows ?? []).map(r => [r.key, r.value ?? '']))
  const pick = (keys: readonly string[]) => keys.map(k => ({ key: k, value: byKey[k] ?? '' }))

  const t = await getTranslations('admin')

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={t('hrSettings.title')} description={t('hrSettings.description')} />
      <RoleSettingsSection title={t('hrSettings.hrSection')} settings={pick(HR_SETTINGS_KEYS)} editable={true} />
      <RoleSettingsSection title={t('hrSettings.financeSection')} settings={pick(FINANCE_SETTINGS_KEYS)} editable={false} />
      <RoleSettingsSection title={t('hrSettings.cooSection')} settings={pick(COO_SETTINGS_KEYS)} editable={false} />
    </div>
  )
}
