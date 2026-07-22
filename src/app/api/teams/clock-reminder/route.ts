import { createServiceClient } from '@/lib/supabase/server'
import { sendProactiveMessage } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'
import { NextRequest, NextResponse } from 'next/server'
import { taipeiToday } from '@/lib/taipei-date'

// T57: Teams Bot clock reminder
// Sends clock-in/clock-out reminders to users who haven't clocked yet
// Triggered by Vercel Cron (GET, type inferred from x-vercel-cron-schedule)
// or manually (POST with { type: 'clock_in' | 'clock_out' })

function checkCronAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  // Fail closed: without CRON_SECRET configured, the endpoint is disabled
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

async function runReminder(reminderType: string) {
  const service = await createServiceClient()
  const today = taipeiToday()

  // Get all active users
  const { data: users } = await service
    .from('users')
    .select('id, display_name, email, employment_type, language')
    .eq('is_active', true)

  if (!users?.length) return NextResponse.json({ data: { sent: 0 } })

  // Get today's attendance records
  const { data: records } = await service
    .from('attendance_records')
    .select('user_id, clock_in, clock_out')
    .eq('clock_date', today)
    .is('voided_at', null) // 已作廢紀錄不算已打卡，仍會發提醒

  const attendanceMap = new Map(records?.map(r => [r.user_id, r]) ?? [])

  let sent = 0

  for (const u of users) {
    const record = attendanceMap.get(u.id)

    let messageKey: 'clockIn' | 'clockOut' | null = null
    if (reminderType === 'clock_in' && !record?.clock_in) {
      // User hasn't clocked in yet
      messageKey = 'clockIn'
    } else if (reminderType === 'clock_out' && record?.clock_in && !record?.clock_out) {
      // User clocked in but hasn't clocked out
      messageKey = 'clockOut'
    }
    if (!messageKey) continue

    // Never let notification failures break the cron run.
    // teamsText builds the message in the recipient's language — getTranslations({ locale })
    // is ignored by src/i18n/request.ts and would use the request cookie locale.
    try {
      if (await sendProactiveMessage(u.id, teamsText(u.language, messageKey))) sent++
    } catch (err) {
      console.error(`[Clock Reminder] failed for ${u.email}:`, err)
    }
  }

  return NextResponse.json({ data: { sent, type: reminderType } })
}

export async function POST(request: NextRequest) {
  const denied = checkCronAuth(request)
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  return runReminder(body.type ?? 'clock_in')
}

export async function GET(request: NextRequest) {
  const denied = checkCronAuth(request)
  if (denied) return denied

  // Vercel Cron invokes via GET with no body and no reliable schedule header.
  // Infer the reminder type from Taipei local time: morning run (0 23 * * 0-4
  // UTC = 07:00 Asia/Taipei) means clock-in, afternoon run (30 9 * * 1-5 UTC =
  // 17:30 Asia/Taipei) means clock-out. ?type= overrides for manual calls.
  const taipeiHour = (new Date().getUTCHours() + 8) % 24
  const type =
    request.nextUrl.searchParams.get('type') ??
    (taipeiHour < 12 ? 'clock_in' : 'clock_out')
  return runReminder(type)
}
