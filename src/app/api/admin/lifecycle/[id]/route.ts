import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

async function canManage(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  const role = data?.role ?? ''
  // 模組關閉時（feature.lifecycle off）非 admin 一律擋下，與頁面 canAccessFeature 一致
  const flags = await getFeatureFlags()
  if (!canAccessFeature(role, flags, 'lifecycle')) return false
  return role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('hr_manager')
}

// PATCH /api/admin/lifecycle/[id]
//   { status: 'completed' | 'active' }               → 更新清單狀態
//   { add_item: { title, category } }                → 新增自訂項目
//   { item_id, done?, note? }                        → 勾選/備註項目
// DELETE ?item_id=xxx → 刪除項目；無參數 → 刪除整份清單
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

  if (body.add_item) {
    const { title, category } = body.add_item
    if (!title?.trim()) return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    const { data: maxRow } = await supabase
      .from('lifecycle_checklist_items')
      .select('sort_order')
      .eq('checklist_id', id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data, error } = await supabase
      .from('lifecycle_checklist_items')
      .insert({
        checklist_id: id,
        title: title.trim(),
        category: category || 'other',
        sort_order: (maxRow?.sort_order ?? 0) + 1,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (body.item_id) {
    const updates: Record<string, unknown> = {}
    if (typeof body.done === 'boolean') {
      updates.done = body.done
      updates.done_by = body.done ? user.id : null
      updates.done_at = body.done ? new Date().toISOString() : null
    }
    if (body.note !== undefined) updates.note = body.note || null
    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('lifecycle_checklist_items')
      .update(updates)
      .eq('id', body.item_id)
      .eq('checklist_id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (body.status && ['active', 'completed'].includes(body.status)) {
    const { data, error } = await supabase
      .from('lifecycle_checklists')
      .update({ status: body.status })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get('item_id')

  if (itemId) {
    const { data, error } = await supabase
      .from('lifecycle_checklist_items')
      .delete()
      .eq('id', itemId)
      .eq('checklist_id', id)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
    return NextResponse.json({ data: null })
  }

  const { data, error } = await supabase
    .from('lifecycle_checklists')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data: null })
}
