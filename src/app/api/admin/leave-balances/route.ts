import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'hr'].includes(currentUser?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { user_id, leave_type_id, year, allocated_days } = await request.json()

  const existing = await service
    .from('leave_balances')
    .select('id, used_days')
    .eq('user_id', user_id)
    .eq('leave_type_id', leave_type_id)
    .eq('year', year)
    .single()

  const used = existing.data?.used_days ?? 0
  const remaining = Math.max(0, allocated_days - used)

  const { error } = await service.from('leave_balances').upsert({
    user_id, leave_type_id, year,
    allocated_days,
    used_days: used,
    remaining_days: remaining,
  }, { onConflict: 'user_id,leave_type_id,year' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { ok: true } })
}
