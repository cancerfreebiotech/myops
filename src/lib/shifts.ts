import type { SupabaseClient } from '@supabase/supabase-js'

export interface ResolvedShift {
  shiftId: string | null
  startTime: string // 'HH:MM'
  flexMinutes: number
  source: 'shift' | 'default'
}

/** date: 'YYYY-MM-DD'（台北）→ ISO 星期幾 1=Mon..7=Sun */
export function isoDow(date: string): number {
  const d = new Date(date + 'T00:00:00Z').getUTCDay() // 0=Sun..6=Sat
  return d === 0 ? 7 : d
}

/**
 * 取得某員工在指定台北日期適用的上班時間。
 * 規則：取 effective_from <= date 的最新一筆指派；若該班別 active 且 work_days 含當日，
 * 用班別 start_time/flex；否則 fallback system_settings.default_clock_in_time（無則 '09:00'）。
 */
export async function resolveShiftStart(
  service: SupabaseClient,
  userId: string,
  date: string,
): Promise<ResolvedShift> {
  const { data: assign } = await service
    .from('user_shifts')
    .select('shift:work_shifts(id, start_time, flex_minutes, work_days, is_active)')
    .eq('user_id', userId)
    .lte('effective_from', date)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  const shift = assign?.shift as unknown as {
    id: string; start_time: string; flex_minutes: number; work_days: number[]; is_active: boolean
  } | null | undefined

  const dow = isoDow(date)
  if (shift && shift.is_active && Array.isArray(shift.work_days) && shift.work_days.includes(dow)) {
    return {
      shiftId: shift.id,
      startTime: String(shift.start_time).slice(0, 5),
      flexMinutes: shift.flex_minutes ?? 0,
      source: 'shift',
    }
  }

  const { data: setting } = await service
    .from('system_settings').select('value').eq('key', 'default_clock_in_time').maybeSingle()
  return {
    shiftId: null,
    startTime: String(setting?.value ?? '09:00').slice(0, 5),
    flexMinutes: 0,
    source: 'default',
  }
}

/**
 * 以 Asia/Taipei 牆鐘時間，計算 clockInIso 相對 startTime('HH:MM')+flex 的遲到分鐘。
 * 回傳 <= 0 表示未遲到。
 */
export function computeLateMinutes(clockInIso: string, startTime: string, flexMinutes = 0): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(clockInIso))
  const hh = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const mm = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  const actual = hh * 60 + mm
  const [sh, sm] = startTime.split(':').map(Number)
  const threshold = sh * 60 + sm + flexMinutes
  return actual - threshold
}
