import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

type Ctx = { params: Promise<{ id: string }> }

type GoalRow = {
  id: string
  review_id: string
  user_id: string
  review: { id: string; user_id: string; manager_id: string | null; status: string } | null
}

async function loadContext(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('performance_goals')
    .select('id, review_id, user_id, review:performance_reviews(id, user_id, manager_id, status)')
    .eq('id', id)
    .maybeSingle()
  return { supabase, goal: data as unknown as GoalRow | null }
}

async function getActorRoles(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, goal: GoalRow) {
  const { data: me } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  const isHR = me?.role === 'admin' || (me?.granted_features as string[] | null)?.includes('hr_manager')
  const isOwner = goal.user_id === userId

  let isManager = goal.review?.manager_id === userId
  if (!isManager) {
    const service = await createServiceClient()
    const { data: target } = await service
      .from('users')
      .select('manager_id')
      .eq('id', goal.user_id)
      .single()
    isManager = target?.manager_id === userId
  }
  return { isHR, isOwner, isManager: isManager && !isOwner }
}

// PATCH /api/performance/goals/[id] — 依考核狀態限定可改欄位
//   goal_setting（本人/HR）：title/description/weight/sort_order
//   goals_approved（本人）：self_rating/self_note
//   pending_manager（主管/HR）：manager_rating/manager_note
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { supabase, goal } = await loadContext(id)
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!goal || !goal.review) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const { isHR, isOwner, isManager } = await getActorRoles(supabase, user.id, goal)
  const body = await request.json()
  const status = goal.review.status
  const updates: Record<string, unknown> = {}

  if (status === 'goal_setting') {
    if (!isOwner && !isHR) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (body.title !== undefined) {
      if (!body.title?.trim()) return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
      updates.title = body.title.trim()
    }
    if (body.description !== undefined) updates.description = body.description?.trim() || null
    if (body.weight !== undefined) {
      const weight = Number(body.weight)
      if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
        return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
      }
      updates.weight = weight
    }
    if (body.sort_order !== undefined && Number.isInteger(Number(body.sort_order))) {
      updates.sort_order = Number(body.sort_order)
    }
  } else if (status === 'goals_approved') {
    if (!isOwner) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (body.self_rating !== undefined) {
      const r = Number(body.self_rating)
      if (!Number.isInteger(r) || r < 1 || r > 5) {
        return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
      }
      updates.self_rating = r
    }
    if (body.self_note !== undefined) updates.self_note = body.self_note?.trim() || null
  } else if (status === 'pending_manager') {
    if (!isManager && !isHR) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (body.manager_rating !== undefined) {
      const r = Number(body.manager_rating)
      if (!Number.isInteger(r) || r < 1 || r > 5) {
        return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
      }
      updates.manager_rating = r
    }
    if (body.manager_note !== undefined) updates.manager_note = body.manager_note?.trim() || null
  } else {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('performance_goals')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/performance/goals/[id] — 目標設定階段本人/HR 可刪
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { supabase, goal } = await loadContext(id)
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!goal || !goal.review) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const { isHR, isOwner } = await getActorRoles(supabase, user.id, goal)
  if (!isOwner && !isHR) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  if (goal.review.status !== 'goal_setting') {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const { error } = await supabase.from('performance_goals').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
