import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireHR(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  if (data?.role !== 'admin' && data?.job_role !== 'hr_manager') return null
  return user
}

// 建立班別
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const user = await requireHR(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json()
  if (!b?.name?.trim() || !b?.start_time || !b?.end_time) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const payload = {
    name: String(b.name).trim(),
    start_time: b.start_time,
    end_time: b.end_time,
    work_days: Array.isArray(b.work_days) && b.work_days.length ? b.work_days : [1, 2, 3, 4, 5],
    flex_minutes: Number.isFinite(b.flex_minutes) ? b.flex_minutes : 0,
    break_minutes: Number.isFinite(b.break_minutes) ? b.break_minutes : 60,
    is_active: b.is_active ?? true,
  }
  const { data, error } = await service.from('work_shifts').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
