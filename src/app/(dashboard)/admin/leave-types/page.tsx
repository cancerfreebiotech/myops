import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { LeaveTypesManager } from './LeaveTypesManager'

export default async function LeaveTypesPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'hr'].includes(currentUser?.role ?? '')) redirect('/')

  const { data: leaveTypes } = await service
    .from('leave_types')
    .select('*')
    .is('deleted_at', null)
    .order('name')

  return (
    <div>
      <PageHeader title="假別管理" description="設定可用假別與規則" />
      <LeaveTypesManager leaveTypes={leaveTypes ?? []} />
    </div>
  )
}
