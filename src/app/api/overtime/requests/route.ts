import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { ot_date, start_time, end_time, reason, ot_type, project_id } = body

  if (!ot_date || !start_time || !end_time || !reason || !ot_type) {
    return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 })
  }

  const { data: userRecord } = await service
    .from('users')
    .select('manager_id')
    .eq('id', user.id)
    .single()

  // Calculate hours
  const startMinutes = parseInt(start_time.split(':')[0]) * 60 + parseInt(start_time.split(':')[1])
  const endMinutes = parseInt(end_time.split(':')[0]) * 60 + parseInt(end_time.split(':')[1])
  const total_hours = Math.max(0, (endMinutes - startMinutes) / 60)

  const { data, error } = await service.from('overtime_requests').insert({
    user_id: user.id,
    ot_date,
    start_time,
    end_time,
    total_hours,
    reason,
    ot_type,
    project_id: project_id ?? null,
    approver_id: userRecord?.manager_id ?? null,
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') ?? 'mine'

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'hr'

  let query = service
    .from('overtime_requests')
    .select(`*, user:users!overtime_requests_user_id_fkey(id, display_name), project:projects(id, name)`)
    .order('created_at', { ascending: false })

  if (view === 'mine') {
    query = query.eq('user_id', user.id)
  } else if (view === 'approve') {
    if (isAdmin) {
      query = query.eq('status', 'pending')
    } else {
      query = query.eq('approver_id', user.id).eq('status', 'pending')
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
