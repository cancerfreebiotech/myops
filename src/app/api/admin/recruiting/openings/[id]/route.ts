import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

const STATUSES = ['open', 'paused', 'closed']

async function canManage(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('hr_manager')
}

// PATCH /api/admin/recruiting/openings/[id] — 編輯職缺（欄位白名單）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    updates.title = body.title.trim()
  }
  if ('department_id' in body) updates.department_id = body.department_id || null
  if ('description' in body) {
    updates.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  }
  if ('requirements' in body) {
    updates.requirements = typeof body.requirements === 'string' && body.requirements.trim() ? body.requirements.trim() : null
  }
  if ('headcount' in body) {
    const numHeadcount = Number(body.headcount)
    if (!Number.isInteger(numHeadcount) || numHeadcount < 1) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    updates.headcount = numHeadcount
  }
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    updates.status = body.status
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('job_openings')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data: data[0] })
}

// DELETE /api/admin/recruiting/openings/[id] — 軟刪除
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('job_openings')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data: null })
}
