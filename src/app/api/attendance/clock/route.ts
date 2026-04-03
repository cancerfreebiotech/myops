import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, lat, lng } = await request.json()
  if (!['in', 'out'].includes(action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const now = new Date()
  const clockDate = now.toISOString().split('T')[0]

  if (action === 'in') {
    // Check if already clocked in today
    const { data: existing } = await service
      .from('attendance_records')
      .select('id, clock_in')
      .eq('user_id', user.id)
      .eq('clock_date', clockDate)
      .single()

    if (existing?.clock_in) {
      return NextResponse.json({ error: '今日已打上班卡' }, { status: 400 })
    }

    if (existing) {
      // Update existing record (may have been auto-created without clock_in)
      const { error } = await service.from('attendance_records').update({
        clock_in: now.toISOString(),
        clock_in_lat: lat ?? null,
        clock_in_lng: lng ?? null,
        is_auto_in: false,
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
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data: { action: 'in', time: now.toISOString() } })
  }

  // action === 'out'
  const { data: record } = await service
    .from('attendance_records')
    .select('id, clock_in, clock_out')
    .eq('user_id', user.id)
    .eq('clock_date', clockDate)
    .single()

  if (!record?.clock_in) {
    return NextResponse.json({ error: '尚未打上班卡' }, { status: 400 })
  }
  if (record.clock_out) {
    return NextResponse.json({ error: '今日已打下班卡' }, { status: 400 })
  }

  const { error } = await service.from('attendance_records').update({
    clock_out: now.toISOString(),
    clock_out_lat: lat ?? null,
    clock_out_lng: lng ?? null,
    is_auto_out: false,
  }).eq('id', record.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { action: 'out', time: now.toISOString() } })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('attendance_records')
    .select('id, clock_in, clock_out, is_auto_in, is_auto_out, clock_in_lat, clock_in_lng')
    .eq('user_id', user.id)
    .eq('clock_date', today)
    .single()

  return NextResponse.json({ data })
}
