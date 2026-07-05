import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

const ACTIONS = ['use', 'open', 'discard', 'adjust']

async function canManageLab(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('lab_manage')
}

// GET /api/lab/lots/[id] — 批次詳情 + 異動記錄
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data, error } = await supabase
    .from('lab_lots')
    .select('*, logs:lab_lot_logs(*, user:users!lab_lot_logs_user_id_fkey(display_name))')
    .eq('id', id)
    .order('created_at', { referencedTable: 'logs', ascending: false })
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data })
}

// PATCH /api/lab/lots/[id] — 批次操作（admin / lab_manage）
// { action: 'use' | 'open' | 'discard' | 'adjust', quantity_delta?, note? }
//   use：quantity_delta 為負值扣減；adjust：直接加 delta；quantity <= 0 → status 'depleted'
//   open：設 opened_at；discard：status 'discarded'；每個動作都寫入 lab_lot_logs
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
  const { action, quantity_delta, note } = body
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }
  const delta = action === 'use' || action === 'adjust' ? Number(quantity_delta) : 0

  // 原子化：SELECT FOR UPDATE + 狀態機 + 庫存更新 + audit log 於單一交易內完成
  const { data, error } = await supabase.rpc('lab_lot_apply', {
    p_lot_id: id,
    p_action: action,
    p_delta: Number.isFinite(delta) ? delta : null,
    p_note: typeof note === 'string' && note.trim() ? note.trim() : null,
  })
  if (error) {
    const msg = error.message || ''
    if (msg.includes('not_found')) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
    if (msg.includes('forbidden')) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (msg.includes('insufficient_stock')) {
      return NextResponse.json({ error: t('common.invalidRequest'), code: 'INSUFFICIENT_STOCK' }, { status: 400 })
    }
    if (msg.includes('invalid_state') || msg.includes('bad_delta') || msg.includes('bad_action')) {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ data })
}
