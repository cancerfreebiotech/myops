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

  // 初次載入與「換月」皆走 calendar_dept_leaves（SECURITY DEFINER）以確保口徑一致：
  // 一般成員看整個部門、admin/HR 看全公司（部門範圍與欄位由 DB 端把關）。
  // 直接查 leave_requests 會受 RLS 限制（僅本人 / 直屬部屬可讀，且已移除「已核准全員可讀」
  // policy），導致一般成員初次載入只看得到自己的假，與換月後 fetchMonth 用同一 RPC 不一致。
  const { data: calRows } = await service.rpc('calendar_dept_leaves', {
    p_from: monthStartStr,
    p_to: monthEndStr,
  })

  // Fetch all departments for admin/HR filter bar
  const { data: departments } = await service
    .from('departments')
    .select('id, name')
    .order('name')

  interface CalendarLeaveRow {
    id: string
    user_id: string
    leave_type_id: string
    start_date: string
    end_date: string
    status: 'approved' | 'pending'
    reason: string | null
    display_name: string | null
    department_id: string | null
    leave_type_name: string | null
  }

  const normalised = ((calRows ?? []) as CalendarLeaveRow[]).map((lr) => ({
    id: lr.id,
    user_id: lr.user_id,
    leave_type_id: lr.leave_type_id,
    start_date: lr.start_date,
    end_date: lr.end_date,
    status: lr.status,
    reason: lr.reason ?? '',
    display_name: lr.display_name ?? '',
    department_id: lr.department_id ?? '',
    leave_type_name: lr.leave_type_name ?? '',
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
