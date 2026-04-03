import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { UsersTable } from './UsersTable'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', authUser.id).single()
  if (currentUser?.role !== 'admin') redirect('/')

  const { data: users } = await supabase
    .from('users')
    .select(`
      *,
      department:departments(id, name, code),
      manager:users!users_manager_id_fkey(id, display_name, email)
    `)
    .order('created_at', { ascending: false })

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name, code')
    .is('deleted_at', null)
    .order('code')

  return (
    <div>
      <PageHeader title="使用者管理" description="管理員工帳號、角色與權限" />
      <UsersTable users={users ?? []} departments={departments ?? []} />
    </div>
  )
}
