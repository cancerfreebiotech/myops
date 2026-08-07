import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { taipeiToday } from '@/lib/taipei-date'
import { resolveShiftStart, computeLateMinutes } from '@/lib/shifts'
import { haversineMeters } from '@/lib/geo'

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { action, lat, lng } = await request.json()
  if (!['in', 'out'].includes(action)) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  // ── F3 地理圍欄強制（用真 service role 讀，繞過使用者 RLS）──
  const admin = createAdminClient()
  const { data: enforceRow } = await admin
    .from('system_settings').select('value').eq('key', 'geofence_enforce').maybeSingle()
  if (enforceRow?.value === 'true') {
    if (lat == null || lng == null) {
      return NextResponse.json(
        { error: t('attendanceClock.geofenceNoLocation'), code: 'GEOFENCE_NO_LOCATION' },
        { status: 403 })
    }
    const { data: fences } = await admin
      .from('geofences').select('lat, lng, radius_m').eq('is_active', true)
    const list = fences ?? []
    if (list.length > 0) {
      const inside = list.some(f =>
        haversineMeters(Number(lat), Number(lng), Number(f.lat), Number(f.lng)) <= Number(f.radius_m))
      if (!inside) {
        return NextResponse.json(
          { error: t('attendanceClock.geofenceOut'), code: 'GEOFENCE_OUT' },
          { status: 403 })
      }
    }
  }

  const now = new Date()
  const clockDate = taipeiToday()

  if (action === 'in') {
    const shift = await resolveShiftStart(service, user.id, clockDate)
    // 非工作日（有班別但當日不在 work_days）不判遲到
    const lateMin = shift.applies ? computeLateMinutes(now.toISOString(), shift.startTime, shift.flexMinutes) : 0
    const isLate = lateMin > 0

    // Check if already clocked in today
    const { data: existing } = await service
      .from('attendance_records')
      .select('id, clock_in, voided_at, void_reason')
      .eq('user_id', user.id)
      .eq('clock_date', clockDate)
      .single()

    const isVoided = !!existing?.voided_at
    if (existing?.clock_in && !isVoided) {
      return NextResponse.json({ error: t('attendanceClock.alreadyClockedIn') }, { status: 400 })
    }

    if (existing) {
      // Update existing record (may have been auto-created without clock_in).
      // 已作廢列：因 UNIQUE(user_id, clock_date) 佔位，重新打卡=復活該列並整列重置；
      // 原作廢原因附註保留於 void_reason（voided_by 不動）作為稽核軌跡。
      const revive = isVoided ? {
        voided_at: null,
        void_reason: existing.void_reason
          ? `${existing.void_reason}（員工重新打卡，紀錄已重置）`
          : null,
        clock_out: null,
        clock_out_lat: null,
        clock_out_lng: null,
        is_auto_out: false,
        note: null,
      } : {}
      const { error } = await service.from('attendance_records').update({
        clock_in: now.toISOString(),
        clock_in_lat: lat ?? null,
        clock_in_lng: lng ?? null,
        is_auto_in: false,
        is_late: isLate,
        late_minutes: Math.max(0, lateMin),
        ...revive,
      }).eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      const { error } = await service.from('attendance_records').insert({
        user_id: user.id,
        clock_date: clockDate,
        clock_in: now.toISOString(),
        clock_in_lat: lat ?? null,
        clock_in_lng: lng ?? null,
        is_auto_in: false,
        is_late: isLate,
        late_minutes: Math.max(0, lateMin),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data: { action: 'in', time: now.toISOString() } })
  }

  // action === 'out'
  const { data: record } = await service
    .from('attendance_records')
    .select('id, clock_in, clock_out, voided_at')
    .eq('user_id', user.id)
    .eq('clock_date', clockDate)
    .single()

  // 已作廢列不得寫入下班卡（會寫進被統計/匯出排除的紀錄）；視同尚未打卡。
  // 沒有上班卡時，若當天有 pending 的「上班」補卡申請，仍放行下班卡
  // （feedback 6e585611：忘打上班卡→送補卡申請→主管還沒核准前就到了下班時間）。
  // 先寫入只有 clock_out 的列；補卡核准後 approve_makeup_request 的
  // ON CONFLICT DO UPDATE 會把 clock_in 補進同一列。
  if (record?.voided_at) {
    return NextResponse.json({ error: t('attendanceClock.notClockedIn') }, { status: 400 })
  }
  if (record?.clock_out) {
    return NextResponse.json({ error: t('attendanceClock.alreadyClockedOut') }, { status: 400 })
  }
  if (!record?.clock_in) {
    const { data: pendingMakeupIn } = await service
      .from('attendance_makeup_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('clock_date', clockDate)
      .eq('clock_type', 'in')
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()
    if (!pendingMakeupIn) {
      return NextResponse.json({ error: t('attendanceClock.notClockedIn') }, { status: 400 })
    }
  }

  const outFields = {
    clock_out: now.toISOString(),
    clock_out_lat: lat ?? null,
    clock_out_lng: lng ?? null,
    is_auto_out: false,
  }
  const { error } = record
    ? await service.from('attendance_records').update(outFields).eq('id', record.id)
    : await service.from('attendance_records').insert({
        user_id: user.id,
        clock_date: clockDate,
        ...outFields,
      })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { action: 'out', time: now.toISOString() } })
}

export async function GET() {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const today = taipeiToday()
  const { data } = await supabase
    .from('attendance_records')
    .select('id, clock_in, clock_out, is_auto_in, is_auto_out, clock_in_lat, clock_in_lng')
    .eq('user_id', user.id)
    .eq('clock_date', today)
    .is('voided_at', null)
    .single()

  // 前端據此在「沒有上班卡」時仍開放下班鈕（見 POST 的 6e585611 註解）
  const { data: pendingMakeupIn } = await supabase
    .from('attendance_makeup_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('clock_date', today)
    .eq('clock_type', 'in')
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ data, pending_makeup_in: !!pendingMakeupIn })
}
