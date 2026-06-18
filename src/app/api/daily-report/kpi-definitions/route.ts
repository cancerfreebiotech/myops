import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/daily-report/kpi-definitions?userId=xxx
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId') ?? user.id

  const { data, error } = await supabase
    .from('dr_kpi_definitions')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/daily-report/kpi-definitions  { user_id, kpi_id, cat, name, unit, target, period, sort_order }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { user_id, kpi_id, cat, name, unit, target, period, sort_order } = body

  if (!user_id || !kpi_id || !name) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Check: current user must be admin or viewer of target user
  const { data: viewerCheck } = await service.rpc('dr_is_viewer_of', { target_user_id: user_id })
  const { data: userRow } = await service.from('users').select('role').eq('id', user.id).single()
  const isAdmin = userRow?.role === 'admin'

  if (!isAdmin && !viewerCheck) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await service
    .from('dr_kpi_definitions')
    .insert({ user_id, kpi_id, cat, name, unit: unit ?? '', target: target ?? 0, period: period ?? 'monthly', sort_order: sort_order ?? 0 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
