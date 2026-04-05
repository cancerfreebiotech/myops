import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { DocumentsClient } from './DocumentsClient'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: departments } = await supabase.from('departments').select('id, name').is('deleted_at', null).order('code')
  const { data: companies } = await supabase.from('companies').select('id, name').is('deleted_at', null).order('name')
  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentUser } = await supabase.from('users').select('role, granted_features, department_id').eq('id', user!.id).single()

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
