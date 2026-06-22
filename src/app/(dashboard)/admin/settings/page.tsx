import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { SettingsClient } from './SettingsClient'
import { FEATURE_KEYS } from '@/lib/feature-flag-keys'
import { ROLE_SETTINGS_KEYS } from '@/lib/role-settings'

export default async function SettingsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (currentUser?.role !== 'admin') redirect('/no-permission')

  const { data: allSettings } = await service
    .from('system_settings')
    .select('key, value')
    .order('key')

  const settings = (allSettings ?? []).filter(s => !s.key.startsWith('feature.') && !(ROLE_SETTINGS_KEYS as readonly string[]).includes(s.key))
  const featureRows = (allSettings ?? []).filter(s => s.key.startsWith('feature.'))
  const featureFlags = Object.fromEntries(
    FEATURE_KEYS.map(k => [k, featureRows.find(r => r.key === `feature.${k}`)?.value === 'true'])
  ) as Record<string, boolean>

  const t = await getTranslations('admin.settings')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <SettingsClient settings={settings} featureFlags={featureFlags} />
    </div>
  )
}
