// Supabase Edge Function: auto-clock
// Runs at 09:30 and 18:30 (Asia/Taipei) to auto-fill missed punches for full-time employees
// Schedule: "30 1 * * *" (UTC 01:30 = TWN 09:30) and "30 10 * * *" (UTC 10:30 = TWN 18:30)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  const action = body.action as 'in' | 'out' | undefined

  const now = new Date()
  const twnOffset = 8 * 60 * 60 * 1000
  const twnNow = new Date(now.getTime() + twnOffset)
  const todayDate = twnNow.toISOString().split('T')[0]
  const hour = twnNow.getUTCHours()

  // Determine which action based on time
  const clockAction = action ?? (hour < 15 ? 'in' : 'out')
  const defaultTime = clockAction === 'in'
    ? `${todayDate}T01:00:00Z`  // 09:00 TWN
    : `${todayDate}T10:00:00Z`  // 18:00 TWN

  // Get all active full-time employees
  const { data: fullTimeUsers, error: usersErr } = await supabase
    .from('users')
    .select('id, display_name, employment_type')
    .eq('is_active', true)
    .eq('employment_type', 'full_time')
    .is('deleted_at', null)

  if (usersErr || !fullTimeUsers) {
    return new Response(JSON.stringify({ error: usersErr?.message ?? 'No users' }), { status: 500 })
  }

  let autoCount = 0
  const errors: string[] = []

  for (const user of fullTimeUsers) {
    const { data: record } = await supabase
      .from('attendance_records')
      .select('id, clock_in, clock_out')
      .eq('user_id', user.id)
      .eq('clock_date', todayDate)
      .single()

    if (clockAction === 'in') {
      if (record?.clock_in) continue  // Already clocked in

      if (record) {
        const { error } = await supabase.from('attendance_records').update({
          clock_in: defaultTime,
          is_auto_in: true,
        }).eq('id', record.id)
        if (error) { errors.push(`${user.id}: ${error.message}`); continue }
      } else {
        const { error } = await supabase.from('attendance_records').insert({
          user_id: user.id,
          clock_date: todayDate,
          clock_in: defaultTime,
          is_auto_in: true,
        })
        if (error) { errors.push(`${user.id}: ${error.message}`); continue }
      }
      autoCount++
    } else {
      // out
      if (!record?.clock_in || record?.clock_out) continue  // No clock-in or already clocked out
      const { error } = await supabase.from('attendance_records').update({
        clock_out: defaultTime,
        is_auto_out: true,
      }).eq('id', record.id)
      if (error) { errors.push(`${user.id}: ${error.message}`); continue }
      autoCount++
    }
  }

  return new Response(JSON.stringify({
    date: todayDate,
    action: clockAction,
    auto_count: autoCount,
    errors,
  }), { headers: { 'Content-Type': 'application/json' } })
})
