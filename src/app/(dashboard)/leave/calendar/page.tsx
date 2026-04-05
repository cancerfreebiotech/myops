import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
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
    .select('id, role, granted_features, department_id, display_name')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const isHR = (currentUser?.granted_features as string[] ?? []).includes('hr_manager')

  // Use Taipei-local date to avoid UTC offset issues
  const nowTaipei = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const year = nowTaipei.getFullYear()
  const month = nowTaipei.getMonth()
  const monthStartStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const monthEndStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // Build base query
  let query = service
    .from('leave_requests')
    .select(
      `id, user_id, leave_type_id, start_date, end_date, status, reason,
       users!leave_requests_user_id_fkey(id, display_name, department_id),
       leave_types!leave_requests_leave_type_id_fkey(id, name_zh)`
    )
    .in('status', ['approved', 'pending'])
    .lte('start_date', monthEndStr)
    .gte('end_date', monthStartStr)

  // Scope by role — admin and HR see all
  if (!isAdmin && !isHR) {
    query = query.eq(
      'users.department_id',
      currentUser?.department_id ?? ''
    )
  }

  const { data: leaveRequests } = await query.order('start_date', {
    ascending: true,
  })

  // Fetch all departments for admin/HR filter bar
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
    leave_type_name: lr.leave_types?.name_zh ?? '',
  }))

  const t = await getTranslations('leave')

  return (
    <div>
      <PageHeader
        title={t('calendar')}
        description={t('calendarDescription')}
      />
      <CalendarClient
        initialLeaves={normalised}
        currentUser={{
          id: currentUser?.id ?? '',
          role: currentUser?.role ?? 'member',
          department_id: currentUser?.department_id ?? '',
          display_name: currentUser?.display_name ?? '',
          isHR,
        }}
        departments={departments ?? []}
        isAdmin={isAdmin || isHR}
        initialYear={year}
        initialMonth={month}
      />
    </div>
  )
}
