import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { OvertimeClient } from './OvertimeClient'

export default async function OvertimePage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, department_id')
    .eq('id', user.id)
    .single()

  const isHR = currentUser?.role === 'admin' || currentUser?.role === 'hr'

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const { data: rates } = await service
    .from('overtime_rates')
    .select('*')
    .eq('is_active', true)
    .order('ot_type')

  // Pending for approval
  let pendingApprovals: any[] = []
  const { data: pending } = await service
    .from('overtime_requests')
    .select(`*, user:users!overtime_requests_user_id_fkey(id, display_name), project:projects(name)`)
    .eq('approver_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  pendingApprovals = pending ?? []

  const t = await getTranslations('overtime')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <OvertimeClient
        currentUser={currentUser}
        projects={projects ?? []}
        rates={rates ?? []}
        pendingApprovals={pendingApprovals}
        isHR={isHR}
      />
    </div>
  )
}
