import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { CompaniesManager } from './CompaniesManager'
import { getTranslations } from 'next-intl/server'

export default async function AdminCompaniesPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', authUser.id).single()
  if (currentUser?.role !== 'admin') redirect('/')

  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .is('deleted_at', null)
    .order('name')

  const t = await getTranslations('admin.companies')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <CompaniesManager companies={companies ?? []} />
    </div>
  )
}
