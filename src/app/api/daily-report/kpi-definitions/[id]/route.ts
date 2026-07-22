import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

// 模組關閉時（feature.daily_report off）非 admin 一律擋下，與頁面 canAccessFeature 一致
async function dailyReportEnabled(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  const flags = await getFeatureFlags()
  return canAccessFeature(data?.role ?? '', flags, 'daily_report')
}

// 授權與 POST /api/daily-report/kpi-definitions 相同：
// admin，或該指標擁有者所屬群組的 viewer。
// createServiceClient() 帶使用者 JWT（RLS 生效），dr_kpi_defs_viewer_write
// policy 亦會在 DB 層把關 —— 這裡的應用層檢查是為了回傳明確的 403。
async function authorize(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  currentUserId: string,
  defId: string,
) {
  const { data: def } = await service
    .from('dr_kpi_definitions')
    .select('id, user_id')
    .eq('id', defId)
    .maybeSingle()
  if (!def) return { def: null, allowed: false }

  const [{ data: viewerCheck }, { data: userRow }] = await Promise.all([
    service.rpc('dr_is_viewer_of', { target_user_id: def.user_id }),
    service.from('users').select('role').eq('id', currentUserId).single(),
  ])
  const isAdmin = userRow?.role === 'admin'
  return { def, allowed: isAdmin || Boolean(viewerCheck) }
}

// PATCH /api/daily-report/kpi-definitions/[id]
// body: { name?, cat?, unit?, target?, period?, sort_order?, active? }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await dailyReportEnabled(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { def, allowed } = await authorize(service, user.id, id)
  if (!def) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, string | number | boolean> = {}
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (typeof body.cat === 'string' && body.cat.trim()) updates.cat = body.cat.trim()
  if (typeof body.unit === 'string') updates.unit = body.unit.trim()
  if (typeof body.target === 'number' && Number.isFinite(body.target)) updates.target = body.target
  if (body.period === 'monthly' || body.period === 'yearly') updates.period = body.period
  if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) updates.sort_order = body.sort_order
  if (typeof body.active === 'boolean') updates.active = body.active

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const { data, error } = await service
    .from('dr_kpi_definitions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/daily-report/kpi-definitions/[id]
// 永久刪除指標定義（歷史 dr_kpi_entries 保留但不再顯示）。
// 可恢復的「停用」請改用 PATCH { active: false }。
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await dailyReportEnabled(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { def, allowed } = await authorize(service, user.id, id)
  if (!def) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await service.from('dr_kpi_definitions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: null })
}
