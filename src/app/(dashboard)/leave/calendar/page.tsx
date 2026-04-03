import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { CalendarClient } from './CalendarClient'

export default async function LeaveCalendarPage() {
  const supabase = await createClient()
  const service = await createServiceClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, department_id, display_name')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const isManager =
    currentUser?.role === 'manager' || currentUser?.role === 'hr'

  // Compute current month boundaries (server-side for initial load)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const monthStartStr = monthStart.toISOString().slice(0, 10)
  const monthEndStr = monthEnd.toISOString().slice(0, 10)

  // Build base query
  let query = service
    .from('leave_requests')
    .select(
      `id, user_id, leave_type_id, start_date, end_date, status, reason,
       users!leave_requests_user_id_fkey(id, display_name, department_id),
       leave_types!leave_requests_leave_type_id_fkey(id, name)`
    )
    .in('status', ['approved', 'pending'])
    .lte('start_date', monthEndStr)
    .gte('end_date', monthStartStr)

  // Scope by role
  if (!isAdmin && !isManager) {
    // Regular employees: only their department
    query = query.eq(
      'users.department_id',
      currentUser?.department_id ?? ''
    )
  } else if (isManager && !isAdmin) {
    // Managers see their department only
    query = query.eq(
      'users.department_id',
      currentUser?.department_id ?? ''
    )
  }
  // Admins see all — no additional filter

  const { data: leaveRequests } = await query.order('start_date', {
    ascending: true,
  })

  // Fetch all departments for admin filter bar
  const { data: departments } = await service
    .from('departments')
    .select('id, name')
    .order('name')

  const normalised = (leaveRequests ?? []).map((lr: any) => ({
    id: lr.id,
    user_id: lr.user_id,
    leave_type_id: lr.leave_type_id,
    start_date: lr.start_date,
    end_date: lr.end_date,
    status: lr.status,
    reason: lr.reason,
    display_name: lr.users?.display_name ?? '',
    department_id: lr.users?.department_id ?? '',
    leave_type_name: lr.leave_types?.name ?? '',
  }))

  return (
    <div>
      <PageHeader
        title="團隊請假日曆"
        description="查看團隊成員的請假排程"
      />
      <CalendarClient
        initialLeaves={normalised}
        currentUser={{
          id: currentUser?.id ?? '',
          role: currentUser?.role ?? 'employee',
          department_id: currentUser?.department_id ?? '',
          display_name: currentUser?.display_name ?? '',
        }}
        departments={departments ?? []}
        isAdmin={isAdmin}
      />
    </div>
  )
}
