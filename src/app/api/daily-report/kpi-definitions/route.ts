import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

// 模組關閉時（feature.daily_report off）非 admin 一律擋下，與頁面 canAccessFeature 一致
async function dailyReportEnabled(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  const flags = await getFeatureFlags()
  return canAccessFeature(data?.role ?? '', flags, 'daily_report')
}

// GET /api/daily-report/kpi-definitions?userId=xxx&includeInactive=1
// 預設只回傳 active 指標（員工填報端）；管理 UI 帶 includeInactive=1 取得含停用者。
// 讀取權限由 RLS 把關（本人 / admin / 該員工群組的 viewer）。
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await dailyReportEnabled(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId') ?? user.id
  const includeInactive = searchParams.get('includeInactive') === '1'

  let query = supabase
    .from('dr_kpi_definitions')
    .select('*')
    .eq('user_id', userId)
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query.order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/daily-report/kpi-definitions  { user_id, kpi_id, cat, name, unit, target, period, sort_order }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await dailyReportEnabled(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
