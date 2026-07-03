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

  const { data: lot } = await supabase
    .from('lab_lots')
    .select('id, quantity, status, opened_at')
    .eq('id', id)
    .maybeSingle()
  if (!lot) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  let delta = 0
  const updates: Record<string, unknown> = {}

  if (action === 'use' || action === 'adjust') {
    delta = Number(quantity_delta)
    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    // use 一律為負值扣減
    if (action === 'use' && delta >= 0) {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    const newQty = Number(lot.quantity) + delta
    updates.quantity = Math.max(newQty, 0)
    if (newQty <= 0) {
      updates.status = 'depleted'
    } else if (lot.status === 'depleted') {
      updates.status = 'in_stock'
    }
  } else if (action === 'open') {
    updates.opened_at = new Date().toISOString()
  } else {
    // discard
    updates.status = 'discarded'
  }

  const { data, error } = await supabase
    .from('lab_lots')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: logError } = await supabase
    .from('lab_lot_logs')
    .insert({
      lot_id: id,
      action,
      quantity_delta: delta,
      user_id: user.id,
      note: typeof note === 'string' && note.trim() ? note.trim() : null,
    })
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 })

  return NextResponse.json({ data })
}
