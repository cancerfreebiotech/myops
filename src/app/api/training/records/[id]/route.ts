import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { canManageTraining } from '@/lib/training'

// PATCH /api/training/records/[id]
//   本人：標記完成 { status:'completed', note?, attachment_paths? }
//   管理者：全欄位（含改回 assigned、調整 hours）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: record } = await supabase
    .from('training_records')
    .select('id, user_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!record) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const manage = await canManageTraining(supabase, user.id)
  const isSelf = record.user_id === user.id
  if (!manage && !isSelf) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const body = await request.json()
  const allowed = manage
    ? ['status', 'hours', 'note', 'attachment_paths', 'completed_at']
    : ['status', 'note', 'attachment_paths']
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  if (updates.status === 'completed' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString()
  }
  if (updates.status === 'assigned') {
    if (!manage) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    updates.completed_at = null
  }

  const { data, error } = await supabase
    .from('training_records')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/training/records/[id] — 取消指派（admin / training_manage）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  if (!(await canManageTraining(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('training_records')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data: null })
}
