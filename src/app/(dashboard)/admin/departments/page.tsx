import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { DepartmentsManager } from './DepartmentsManager'

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

  return (
    <div>
      <PageHeader title="部門管理" description="管理公司部門與代號" />
      <DepartmentsManager departments={departments ?? []} />
    </div>
  )
}
