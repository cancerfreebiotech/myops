import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { AttendanceClient, type AllRecordsData } from './AttendanceClient'
import type {
  AttendanceRecord as AdminAttendanceRecord,
  User as AdminAttendanceUser,
} from '@/app/(dashboard)/admin/attendance/AdminAttendanceClient'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

interface PageProps {
  // tab 走 URL 而非 React state：全員紀錄分頁換月份會 router.push 觸發本頁重新取資料，
  // 若 tab 只存在 client state，換月份後會彈回打卡分頁。
  searchParams: Promise<{ tab?: string; month?: string; user_id?: string; employment_type?: string }>
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const t = await getTranslations('attendance')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, job_role, granted_features, employment_type, display_name, department_id')
    .eq('id', user.id)
    .single()

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'attendance')) redirect('/no-permission')

  // 全站 HR 判定慣例（role 沒有 'hr' 這個值）；job_role 一併保留，
  // 因為原本的「打卡紀錄管理」頁就是這樣放行的，搬進來不能讓人掉權限。
  const grantedFeatures = (currentUser?.granted_features as string[] | null) ?? []
  const isHR = currentUser?.role === 'admin'
    || currentUser?.job_role === 'hr_manager'
    || grantedFeatures.includes('hr_manager')

  const sp = await searchParams
  const tab = sp.tab === 'records' || (sp.tab === 'all' && isHR) ? sp.tab : 'clock'

  // 只有 HR 真的打開「全員紀錄」才撈全公司資料，一般員工開打卡頁不多打這些 query
  let allRecords: AllRecordsData | null = null
  if (tab === 'all') {
    const service = await createServiceClient()

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
        note,
        voided_at,
        voided_by,
        void_reason,
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
      .order('display_name')

    // Today's stats — use Taipei time to avoid UTC offset
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    const { data: todayRecords } = await service
      .from('attendance_records')
      .select('id, user_id, clock_in, is_auto_in')
      .eq('clock_date', today)
      .is('voided_at', null)

    const todayClockedIn = todayRecords?.filter(r => r.clock_in).length ?? 0
    // 統計排除已作廢紀錄（列表仍顯示，帶標記）
    const autoMakeupCount = attendanceRecords?.filter(r => !r.voided_at && (r.is_auto_in || r.is_auto_out)).length ?? 0

    // Average attendance days for the month
    const userDaysMap: Record<string, number> = {}
    attendanceRecords?.forEach(r => {
      if (r.voided_at) return
      const uid = r.user_id
      if (!userDaysMap[uid]) userDaysMap[uid] = 0
      if (r.clock_in) userDaysMap[uid]++
    })
    const userCount = Object.keys(userDaysMap).length
    const avgDays = userCount > 0
      ? Math.round(Object.values(userDaysMap).reduce((a, b) => a + b, 0) / userCount * 10) / 10
      : 0

    allRecords = {
      attendanceRecords: (attendanceRecords ?? []) as unknown as AdminAttendanceRecord[],
      allUsers: (allUsers ?? []) as unknown as AdminAttendanceUser[],
      month,
      userId: sp.user_id ?? '',
      employmentType: sp.employment_type ?? 'all',
      todayClockedIn,
      avgDays,
      autoMakeupCount,
    }
  }

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AttendanceClient
        currentUser={currentUser!}
        isHR={isHR}
        tab={tab}
        allRecords={allRecords}
      />
    </div>
  )
}
