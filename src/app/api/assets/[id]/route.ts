import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isValidDateString } from '@/lib/taipei-date'

const CATEGORIES = ['it_equipment', 'instrument', 'furniture', 'other']
const STATUSES = ['in_use', 'idle', 'repair', 'retired']

async function canManage(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return {
    isAdmin: data?.role === 'admin',
    manage: data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('asset_manage'),
  }
}

// GET /api/assets/[id] — 詳情 + 記錄
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const [asset, logs] = await Promise.all([
    supabase
      .from('assets')
      .select('*, custodian:users!assets_custodian_id_fkey(id, display_name)')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('asset_logs')
      .select('*, user:users!asset_logs_user_id_fkey(display_name)')
      .eq('asset_id', id)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (!asset.data) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data: { ...asset.data, logs: logs.data ?? [] } })
}

// PATCH /api/assets/[id] — 編輯（admin / asset_manage）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { manage } = await canManage(supabase, user.id)
  if (!manage) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const body = await request.json()
  const invalid = () => NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  // 只允許白名單欄位，並比照 POST 驗證/正規化每個值，避免非法值落 DB 或外洩 PG 錯誤
  const updates: Record<string, unknown> = {}

  if ('asset_no' in body) {
    if (typeof body.asset_no !== 'string' || !body.asset_no.trim()) return invalid()
    updates.asset_no = body.asset_no.trim()
  }
  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) return invalid()
    updates.name = body.name.trim()
  }
  if ('category' in body) {
    if (!CATEGORIES.includes(body.category)) return invalid()
    updates.category = body.category
  }
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) return invalid()
    updates.status = body.status
  }
  for (const f of ['serial_no', 'location', 'custodian_id', 'vendor_name', 'note'] as const) {
    if (f in body) updates[f] = body[f] || null
  }
  for (const f of ['purchase_date', 'next_calibration_date', 'next_maintenance_date'] as const) {
    if (f in body) {
      if (body[f] && !isValidDateString(body[f])) return invalid()
      updates[f] = body[f] || null
    }
  }
  if ('purchase_amount' in body) {
    const v = body.purchase_amount
    if (v === '' || v === null || v === undefined) {
      updates.purchase_amount = null
    } else if (Number.isFinite(Number(v))) {
      updates.purchase_amount = Number(v)
    } else {
      return invalid()
    }
  }
  for (const f of ['calibration_cycle_months', 'maintenance_cycle_months'] as const) {
    if (f in body) {
      const v = body[f]
      if (v === '' || v === null || v === undefined) {
        updates[f] = null
      } else if (Number.isFinite(Number(v))) {
        updates[f] = Number(v)
      } else {
        return invalid()
      }
    }
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('assets')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  if (!data) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data })
}

// DELETE /api/assets/[id] — 軟刪除（admin）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { isAdmin } = await canManage(supabase, user.id)
  if (!isAdmin) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { data, error } = await supabase
    .from('assets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data: null })
}
