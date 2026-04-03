import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clock_date, clock_type, clock_time, reason } = await request.json()
  if (!clock_date || !clock_type || !clock_time || !reason) {
    return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 })
  }

  // Get user's manager
  const { data: userRecord } = await service
    .from('users')
    .select('manager_id, display_name')
    .eq('id', user.id)
    .single()

  const { data, error } = await service.from('attendance_makeup_requests').insert({
    user_id: user.id,
    clock_date,
    clock_type,
    clock_time,
    reason,
    approver_id: userRecord?.manager_id ?? null,
    status: 'pending',
  }).select().single()

  if (error) {
    // Table may not exist yet, graceful error
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'hr'

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') ?? 'mine'

  let query = service
    .from('attendance_makeup_requests')
    .select(`*, user:users!attendance_makeup_requests_user_id_fkey(id, display_name)`)
    .order('created_at', { ascending: false })

  if (view === 'mine') {
    query = query.eq('user_id', user.id)
  } else if (view === 'approve' && !isAdmin) {
    query = query.eq('approver_id', user.id).eq('status', 'pending')
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
