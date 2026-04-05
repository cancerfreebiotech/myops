import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { DepartmentsManager } from './DepartmentsManager'
import { getTranslations } from 'next-intl/server'

export default async function AdminDepartmentsPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', authUser.id).single()
  if (currentUser?.role !== 'admin') redirect('/')

  const { data: departments } = await supabase
    .from('departments')
    .select('*')
    .is('deleted_at', null)
    .order('code')

  const t = await getTranslations('admin.departments')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <DepartmentsManager departments={departments ?? []} />
    </div>
  )
}
