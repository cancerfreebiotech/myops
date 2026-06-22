import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { DocumentsClient } from './DocumentsClient'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, granted_features, department_id').eq('id', user.id).single()

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'documents')) redirect('/no-permission')

  const { data: departments } = await supabase.from('departments').select('id, name').is('deleted_at', null).order('code')
  const { data: companies } = await supabase.from('companies').select('id, name').is('deleted_at', null).order('name')

  const t = await getTranslations('documents')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <DocumentsClient
        departments={departments ?? []}
        companies={companies ?? []}
        currentUser={currentUser}
      />
    </div>
  )
}
