import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { LeaveTypesManager } from './LeaveTypesManager'

export default async function LeaveTypesPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.job_role === 'hr_manager'
  const isCOO = currentUser?.job_role === 'coo'
  if (!isAdmin && !isHR && !isCOO) redirect('/no-permission')

  const { data: leaveTypes } = await service
    .from('leave_types')
    .select('*')
    .is('deleted_at', null)
    .order('name')

  const t = await getTranslations('nav')
  const tAdmin = await getTranslations('admin.leaveTypes')

  return (
    <div>
      <PageHeader title={t('adminLeaveTypes')} description={tAdmin('description')} />
      <LeaveTypesManager leaveTypes={leaveTypes ?? []} />
    </div>
  )
}
