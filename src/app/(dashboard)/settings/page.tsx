import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, display_name, email, role, department_id, employment_type, language, theme')
    .eq('id', user.id)
    .single()

  const t = await getTranslations('settings')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <SettingsClient profile={profile} />
    </div>
  )
}
