import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isValidDateString, taipeiToday } from '@/lib/taipei-date'

async function requireHR(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  if (data?.role !== 'admin' && data?.job_role !== 'hr_manager') return null
  return user
}

// 指派員工班別（同一員工同一 effective_from 覆蓋）
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const user = await requireHR(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { user_id, shift_id, effective_from } = await request.json()
  if (!user_id || !shift_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const eff = isValidDateString(effective_from) ? effective_from : taipeiToday()

  const { data, error } = await service.from('user_shifts')
    .upsert({ user_id, shift_id, effective_from: eff, created_by: user.id },
      { onConflict: 'user_id,effective_from' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
