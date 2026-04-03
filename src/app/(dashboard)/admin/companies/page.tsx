import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { CompaniesManager } from './CompaniesManager'

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

  return (
    <div>
      <PageHeader title="公司主檔" description="管理外部合約的往來公司" />
      <CompaniesManager companies={companies ?? []} />
    </div>
  )
}
