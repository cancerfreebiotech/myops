import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// T57: Teams Bot clock reminder
// Sends clock-in/clock-out reminders to users who haven't clocked yet
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = await createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ops.cancerfree.io'

  // Get all active users
  const { data: users } = await service
    .from('users')
    .select('id, display_name, email, employment_type')
    .eq('is_active', true)

  if (!users?.length) return NextResponse.json({ data: { sent: 0 } })

  // Get today's attendance records
  const { data: records } = await service
    .from('attendance_records')
    .select('user_id, clock_in, clock_out')
    .eq('clock_date', today)

  const attendanceMap = new Map(records?.map(r => [r.user_id, r]) ?? [])

  const body = await request.json().catch(() => ({}))
  const reminderType = body.type ?? 'clock_in' // 'clock_in' or 'clock_out'

  let sent = 0

  for (const u of users) {
    const record = attendanceMap.get(u.id)

    if (reminderType === 'clock_in' && !record?.clock_in) {
      // User hasn't clocked in yet
      console.log(`[Clock Reminder] ${u.email}: 請記得打上班卡 👉 ${appUrl}/attendance`)
      sent++
    } else if (reminderType === 'clock_out' && record?.clock_in && !record?.clock_out) {
      // User clocked in but hasn't clocked out
      console.log(`[Clock Reminder] ${u.email}: 請記得打下班卡 👉 ${appUrl}/attendance`)
      sent++
    }
  }

  return NextResponse.json({ data: { sent, type: reminderType } })
}
