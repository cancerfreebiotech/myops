import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// GET /api/performance/reviews?view=mine|team|all&cycle_id=
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') ?? 'mine'
  const cycleId = searchParams.get('cycle_id')

  const { data: me } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const isHR = me?.role === 'admin' || (me?.granted_features as string[] | null)?.includes('hr_manager')
  if (view === 'all' && !isHR) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  let query = supabase
    .from('performance_reviews')
    .select('*, user:users!performance_reviews_user_id_fkey(id, display_name), manager:users!performance_reviews_manager_id_fkey(id, display_name), cycle:performance_cycles(id, name, start_date, end_date, status)')
    .order('created_at', { ascending: false })
  if (cycleId) query = query.eq('cycle_id', cycleId)
  if (view === 'mine') query = query.eq('user_id', user.id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = data ?? []
  if (view === 'team') {
    // 直屬部屬 + 記錄上指定我為主管者（RLS 已限縮可讀範圍，這裡再排除自己的）
    const service = await createServiceClient()
    const { data: reports } = await service
      .from('users')
      .select('id')
      .eq('manager_id', user.id)
    const reportIds = new Set((reports ?? []).map(r => r.id))
    rows = rows.filter(r =>
      r.user_id !== user.id && (r.manager_id === user.id || reportIds.has(r.user_id))
    )
  }
  return NextResponse.json({ data: rows })
}

// POST /api/performance/reviews { cycle_id } — 員工在 open 週期為自己啟動考核
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { cycle_id } = await request.json()
  if (!cycle_id) return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })

  const { data: cycle } = await supabase
    .from('performance_cycles')
    .select('id, status')
    .eq('id', cycle_id)
    .maybeSingle()
  if (!cycle) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  if (cycle.status !== 'open') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { data: existing } = await supabase
    .from('performance_reviews')
    .select('*')
    .eq('cycle_id', cycle_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (existing) return NextResponse.json({ data: existing })

  const { data: userRecord } = await service
    .from('users')
    .select('manager_id')
    .eq('id', user.id)
    .single()

  const { data, error } = await supabase
    .from('performance_reviews')
    .insert({ cycle_id, user_id: user.id, manager_id: userRecord?.manager_id ?? null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
