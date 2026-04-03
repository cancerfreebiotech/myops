import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { ContractsClient } from './ContractsClient'

export default async function ContractsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, granted_features')
    .eq('id', user.id)
    .single()

  const canApprove = currentUser?.role === 'admin' ||
    currentUser?.granted_features?.includes('approve_contract')

  return (
    <div>
      <PageHeader title="合約管理" description="NDA、MOU、合約、修正案" />
      <ContractsClient
        companies={companies ?? []}
        currentUser={currentUser}
        canApprove={canApprove}
      />
    </div>
  )
}
