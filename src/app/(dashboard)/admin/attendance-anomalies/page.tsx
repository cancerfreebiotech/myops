import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnomaliesClient } from './AnomaliesClient'

export default async function AttendanceAnomaliesPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'hr'].includes(currentUser?.role ?? '')) redirect('/')

  // Full-time users with 3+ consecutive auto-clock days in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: autoRecords } = await service
    .from('attendance_records')
    .select(`
      user_id, clock_date, is_auto_in, is_auto_out,
      user:users!attendance_records_user_id_fkey(id, display_name, employment_type, department:departments(name))
    `)
    .gte('clock_date', thirtyDaysAgo)
    .or('is_auto_in.eq.true,is_auto_out.eq.true')
    .order('clock_date', { ascending: false })

  // Group by user and find consecutive auto days
  const userAutoMap: Record<string, { user: any; dates: string[] }> = {}
  for (const r of autoRecords ?? []) {
    if (!userAutoMap[r.user_id]) userAutoMap[r.user_id] = { user: r.user, dates: [] }
    userAutoMap[r.user_id].dates.push(r.clock_date)
  }

  const anomalies = Object.values(userAutoMap)
    .filter(({ dates }) => dates.length >= 3)
    .map(({ user, dates }) => ({
      user,
      auto_days: dates.length,
      recent_dates: dates.slice(0, 5),
    }))
    .sort((a, b) => b.auto_days - a.auto_days)

  // Intern missed clock count this month
  const monthStart = new Date()
  monthStart.setDate(1)
  const monthStartStr = monthStart.toISOString().split('T')[0]

  const { data: internMissed } = await service
    .from('attendance_records')
    .select(`
      user_id, clock_date,
      user:users!attendance_records_user_id_fkey(id, display_name, employment_type)
    `)
    .gte('clock_date', monthStartStr)
    .or('clock_in.is.null,clock_out.is.null')
    .eq('user.employment_type', 'intern')

  const internMap: Record<string, { user: any; missed: number }> = {}
  for (const r of internMissed ?? []) {
    const u = Array.isArray(r.user) ? r.user[0] : r.user
    if (u?.employment_type !== 'intern') continue
    if (!internMap[r.user_id]) internMap[r.user_id] = { user: r.user, missed: 0 }
    internMap[r.user_id].missed++
  }
  const internAnomalies = Object.values(internMap).filter(({ missed }) => missed > 3)

  const t = await getTranslations('nav')

  return (
    <div>
      <PageHeader title={t('adminAttendanceAnomalies')} description="連續自動補打、實習生漏打統計" />
      <AnomaliesClient anomalies={anomalies} internAnomalies={internAnomalies} />
    </div>
  )
}
