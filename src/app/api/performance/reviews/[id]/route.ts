import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/performance/reviews/[id] — 考核詳情（含目標；RLS 限縮可讀者）
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: review } = await supabase
    .from('performance_reviews')
    .select('*, user:users!performance_reviews_user_id_fkey(id, display_name), manager:users!performance_reviews_manager_id_fkey(id, display_name), cycle:performance_cycles(id, name, start_date, end_date, status)')
    .eq('id', id)
    .maybeSingle()
  if (!review) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const { data: goals, error } = await supabase
    .from('performance_goals')
    .select('*')
    .eq('review_id', id)
    .order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ...review, goals: goals ?? [] } })
}

// PATCH /api/performance/reviews/[id]
// { action: 'submit_goals' | 'approve_goals' | 'return_goals' | 'submit_self' | 'complete' | 'reopen', ... }
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const body = await request.json()
  const { action } = body

  const { data: review } = await supabase
    .from('performance_reviews')
    .select('*, cycle:performance_cycles(id, name, start_date, end_date, status)')
    .eq('id', id)
    .maybeSingle()
  if (!review) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const { data: me } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const isHR = me?.role === 'admin' || (me?.granted_features as string[] | null)?.includes('hr_manager')
  const isOwner = review.user_id === user.id

  // 直屬主管：記錄上的 manager_id，或 users.manager_id 現值
  let isManager = review.manager_id === user.id
  if (!isManager) {
    const { data: target } = await service
      .from('users')
      .select('manager_id')
      .eq('id', review.user_id)
      .single()
    isManager = target?.manager_id === user.id
  }
  const canReviewAsManager = (isManager && !isOwner) || isHR

  const requireMfa = async () => {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    return aalData?.currentLevel === 'aal2'
  }

  const { data: goals } = await supabase
    .from('performance_goals')
    .select('id, weight, self_rating, manager_rating')
    .eq('review_id', id)

  let updates: Record<string, unknown> | null = null

  if (action === 'submit_goals') {
    if (!isOwner) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (review.status !== 'goal_setting' || review.cycle?.status !== 'open') {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    const totalWeight = (goals ?? []).reduce((s, g) => s + (g.weight ?? 0), 0)
    if ((goals ?? []).length === 0 || totalWeight !== 100) {
      return NextResponse.json({ error: t('common.invalidRequest'), code: 'WEIGHT_NOT_100' }, { status: 400 })
    }
    updates = { status: 'goals_submitted', return_reason: null }
  } else if (action === 'approve_goals' || action === 'return_goals') {
    if (!canReviewAsManager) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (review.status !== 'goals_submitted') {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    if (!(await requireMfa())) {
      return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
    }
    updates = action === 'approve_goals'
      ? { status: 'goals_approved', goals_approved_by: user.id, goals_approved_at: new Date().toISOString(), return_reason: null }
      : { status: 'goal_setting', return_reason: body.return_reason ?? null }
  } else if (action === 'submit_self') {
    if (!isOwner) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (review.status !== 'goals_approved' || review.cycle?.status === 'closed') {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    if ((goals ?? []).some(g => g.self_rating == null)) {
      return NextResponse.json({ error: t('common.invalidRequest'), code: 'SELF_RATING_INCOMPLETE' }, { status: 400 })
    }
    updates = { status: 'pending_manager', self_comment: body.self_comment?.trim() || null }
  } else if (action === 'complete') {
    if (!canReviewAsManager) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (review.status !== 'pending_manager') {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    const managerScore = Number(body.manager_score)
    if (!Number.isFinite(managerScore) || managerScore < 1 || managerScore > 5) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    if ((goals ?? []).some(g => g.manager_rating == null)) {
      return NextResponse.json({ error: t('common.invalidRequest'), code: 'MANAGER_RATING_INCOMPLETE' }, { status: 400 })
    }
    if (!(await requireMfa())) {
      return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
    }
    // KPI 快照（銜接每日報告；函數內做授權檢查）
    const { data: kpi } = await supabase.rpc('perf_kpi_summary', {
      target_user_id: review.user_id,
      from_date: review.cycle?.start_date,
      to_date: review.cycle?.end_date,
    })
    updates = {
      status: 'completed',
      manager_score: managerScore,
      manager_comment: body.manager_comment?.trim() || null,
      kpi_snapshot: kpi ?? [],
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    }
  } else if (action === 'reopen') {
    if (!isHR) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (review.status !== 'completed') {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    if (!(await requireMfa())) {
      return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
    }
    updates = { status: 'pending_manager', completed_by: null, completed_at: null }
  } else {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('performance_reviews')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
