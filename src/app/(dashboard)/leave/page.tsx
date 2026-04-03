import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { LeaveClient } from './LeaveClient'

export default async function LeavePage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, employment_type, department_id, manager_id, display_name')
    .eq('id', user.id)
    .single()

  const isHR = currentUser?.role === 'admin' || currentUser?.role === 'hr'

  // Leave types available to this user
  const empType = currentUser?.employment_type ?? 'full_time'
  const { data: leaveTypes } = await service
    .from('leave_types')
    .select('id, name, applies_to, pay_rate, max_days_per_year, advance_days_required')
    .eq('is_active', true)
    .in('applies_to', empType === 'intern' ? ['all', 'intern'] : ['all', 'full_time'])
    .is('deleted_at', null)
    .order('name')

  // Leave balances
  const currentYear = new Date().getFullYear()
  const { data: balances } = await service
    .from('leave_balances')
    .select(`*, leave_type:leave_types(name)`)
    .eq('user_id', user.id)
    .eq('year', currentYear)

  // Potential deputy approvers (same department)
  const { data: colleagues } = await supabase
    .from('users')
    .select('id, display_name')
    .eq('department_id', currentUser?.department_id ?? '')
    .eq('is_active', true)
    .neq('id', user.id)
    .is('deleted_at', null)
    .order('display_name')

  // For HR: all pending requests to approve
  let pendingApprovals: any[] = []
  if (isHR || currentUser?.role === 'manager') {
    const { data } = await service
      .from('leave_requests')
      .select(`*, user:users!leave_requests_user_id_fkey(id, display_name), leave_type:leave_types(name)`)
      .eq('approver_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    pendingApprovals = data ?? []
  }

  return (
    <div>
      <PageHeader title="請假管理" description="請假申請與紀錄" />
      <LeaveClient
        currentUser={currentUser}
        leaveTypes={leaveTypes ?? []}
        balances={balances ?? []}
        colleagues={colleagues ?? []}
        pendingApprovals={pendingApprovals}
        isHR={isHR}
      />
    </div>
  )
}
