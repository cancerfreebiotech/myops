import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// POST /api/performance/goals { review_id, title, description?, weight }
// 本人（或 HR/admin）在目標設定階段新增目標
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const body = await request.json()
  const { review_id, title, description } = body
  const weight = Number(body.weight)
  if (!review_id || !title?.trim() || !Number.isInteger(weight) || weight < 0 || weight > 100) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data: review } = await supabase
    .from('performance_reviews')
    .select('id, user_id, status, cycle:performance_cycles(status)')
    .eq('id', review_id)
    .maybeSingle()
  if (!review) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const { data: me } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const isHR = me?.role === 'admin' || (me?.granted_features as string[] | null)?.includes('hr_manager')
  if (review.user_id !== user.id && !isHR) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }
  const cycleStatus = (review.cycle as { status?: string } | null)?.status
  if (review.status !== 'goal_setting' || cycleStatus !== 'open') {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const { data: last } = await supabase
    .from('performance_goals')
    .select('sort_order')
    .eq('review_id', review_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('performance_goals')
    .insert({
      review_id,
      user_id: review.user_id,
      title: title.trim(),
      description: description?.trim() || null,
      weight,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
