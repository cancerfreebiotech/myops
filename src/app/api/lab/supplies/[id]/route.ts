import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

const CATEGORIES = ['reagent', 'consumable', 'other']
const STORAGE_CONDITIONS = ['RT', '4C', '-20C', '-80C', 'LN2', 'other']

async function canManageLab(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('lab_manage')
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// PATCH /api/lab/supplies/[id] — 編輯品項（admin / lab_manage）
// 欄位白名單：name, category, catalog_no, vendor_name, storage_condition, unit, safety_stock, note
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManageLab(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    updates.name = body.name.trim()
  }
  if ('category' in body) {
    if (!CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    updates.category = body.category
  }
  if ('catalog_no' in body) updates.catalog_no = strOrNull(body.catalog_no)
  if ('vendor_name' in body) updates.vendor_name = strOrNull(body.vendor_name)
  if ('storage_condition' in body) {
    if (!STORAGE_CONDITIONS.includes(body.storage_condition)) {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    updates.storage_condition = body.storage_condition
  }
  if ('unit' in body) updates.unit = typeof body.unit === 'string' ? body.unit.trim() : ''
  if ('safety_stock' in body) {
    const n = Number(body.safety_stock)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    updates.safety_stock = n
  }
  if ('note' in body) updates.note = strOrNull(body.note)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('lab_supplies')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data })
}

// DELETE /api/lab/supplies/[id] — 軟刪除品項（admin / lab_manage）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManageLab(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('lab_supplies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data: null })
}
