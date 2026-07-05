import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// GET /api/performance/kpi-summary?cycle_id=&user_id=
// 彙總每日報告 KPI（目標 vs 實績）；授權由 perf_kpi_summary SECURITY DEFINER 函數把關
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const cycleId = searchParams.get('cycle_id')
  const targetUserId = searchParams.get('user_id') ?? user.id
  if (!cycleId) return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })

  const { data: cycle } = await supabase
    .from('performance_cycles')
    .select('id, start_date, end_date')
    .eq('id', cycleId)
    .maybeSingle()
  if (!cycle) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const { data, error } = await supabase.rpc('perf_kpi_summary', {
    target_user_id: targetUserId,
    from_date: cycle.start_date,
    to_date: cycle.end_date,
  })
  if (error) {
    const status = error.message.includes('forbidden') ? 403 : 500
    return NextResponse.json({ error: status === 403 ? t('common.forbidden') : error.message }, { status })
  }
  return NextResponse.json({ data: data ?? [] })
}
