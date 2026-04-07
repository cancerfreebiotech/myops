import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { UsersTable } from './UsersTable'
import { getTranslations } from 'next-intl/server'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, job_role').eq('id', authUser.id).single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.job_role === 'hr_manager'
  if (!isAdmin && !isHR) redirect('/')

  const service = await createServiceClient()

  const { data: users } = await service
    .from('users')
    .select(`
      *,
      department:departments(id, name, code)
    `)
    .order('created_at', { ascending: false })

  const { data: departments } = await service
    .from('departments')
    .select('id, name, code')
    .is('deleted_at', null)
    .order('code')

  const t = await getTranslations('admin.users')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <UsersTable users={users ?? []} departments={departments ?? []} isAdmin={isAdmin} />
    </div>
  )
}
