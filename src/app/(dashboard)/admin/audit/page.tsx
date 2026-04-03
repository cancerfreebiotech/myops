import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { AuditClient } from './AuditClient'

export default async function AuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'hr'].includes(currentUser?.role ?? '')) redirect('/')

  return (
    <div>
      <PageHeader title="稽核紀錄" description="所有操作紀錄，保存 5 年" />
      <AuditClient />
    </div>
  )
}
