import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

const EDITABLE_FIELDS = [
  'asset_no', 'name', 'category', 'serial_no', 'location', 'custodian_id', 'status',
  'purchase_date', 'purchase_amount', 'vendor_name',
  'calibration_cycle_months', 'next_calibration_date',
  'maintenance_cycle_months', 'next_maintenance_date', 'note',
]

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
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => EDITABLE_FIELDS.includes(k)))
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('assets')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
