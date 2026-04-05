import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { AdminAttendanceClient } from './AdminAttendanceClient'

interface PageProps {
  searchParams: Promise<{ month?: string; user_id?: string; employment_type?: string }>
}

export default async function AdminAttendancePage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'hr_manager' || currentUser?.role === 'hr'
  if (!isAdmin) redirect('/')

  const sp = await searchParams
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const month = sp.month ?? defaultMonth

  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr)
  const monthNum = parseInt(monthStr)

  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const lastDay = new Date(year, monthNum, 0).getDate()
  const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // Fetch attendance records for the selected month (all users)
  const { data: attendanceRecords } = await service
    .from('attendance_records')
    .select(`
      id,
      user_id,
      clock_date,
      clock_in,
      clock_out,
      is_auto_in,
      is_auto_out,
      notes,
      user:users!attendance_records_user_id_fkey(
        id,
        display_name,
        employment_type,
        department:departments(name)
      )
    `)
    .gte('clock_date', startDate)
    .lte('clock_date', endDate)
    .order('clock_date', { ascending: false })
    .order('user_id')

  // Fetch all active users
  const { data: allUsers } = await service
    .from('users')
    .select('id, display_name, employment_type, department:departments(name)')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('display_name')

  // Today's stats — use Taipei time to avoid UTC offset
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  const { data: todayRecords } = await service
    .from('attendance_records')
    .select('id, user_id, clock_in, is_auto_in')
    .eq('clock_date', today)

  const todayClockedIn = todayRecords?.filter(r => r.clock_in).length ?? 0
  const autoMakeupCount = attendanceRecords?.filter(r => r.is_auto_in || r.is_auto_out).length ?? 0

  // Average attendance days for the month
  const userDaysMap: Record<string, number> = {}
  attendanceRecords?.forEach(r => {
    const uid = r.user_id
    if (!userDaysMap[uid]) userDaysMap[uid] = 0
    if (r.clock_in) userDaysMap[uid]++
  })
  const userCount = Object.keys(userDaysMap).length
  const avgDays = userCount > 0
    ? Math.round(Object.values(userDaysMap).reduce((a, b) => a + b, 0) / userCount * 10) / 10
    : 0

  const t = await getTranslations('attendance.admin')

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
      />
      <AdminAttendanceClient
        attendanceRecords={(attendanceRecords ?? []) as any[]}
        allUsers={(allUsers ?? []) as any[]}
        initialMonth={month}
        initialUserId={sp.user_id ?? ''}
        initialEmploymentType={sp.employment_type ?? 'all'}
        todayClockedIn={todayClockedIn}
        avgDays={avgDays}
        autoMakeupCount={autoMakeupCount}
      />
    </div>
  )
}
