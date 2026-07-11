import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isValidDateString } from '@/lib/taipei-date'

async function canManageLab(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('lab_manage')
}

// POST /api/lab/lots — 入庫新批次（admin / lab_manage）
// { supply_id*, lot_no*, expiry_date, quantity*, received_date }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManageLab(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()
  const { supply_id, lot_no, expiry_date, quantity, received_date } = body

  if (typeof supply_id !== 'string' || !supply_id || typeof lot_no !== 'string' || !lot_no.trim()) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  const numQty = Number(quantity)
  if (!Number.isFinite(numQty) || numQty <= 0) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  if (expiry_date != null && expiry_date !== '' && !isValidDateString(expiry_date)) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }
  if (received_date != null && received_date !== '' && !isValidDateString(received_date)) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const { data: lot, error } = await supabase
    .from('lab_lots')
    .insert({
      supply_id,
      lot_no: lot_no.trim(),
      expiry_date: expiry_date || null,
      quantity: numQty,
      received_date: received_date || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: logError } = await supabase
    .from('lab_lot_logs')
    .insert({
      lot_id: lot.id,
      action: 'receive',
      quantity_delta: numQty,
      user_id: user.id,
    })

  if (logError) {
    // The two inserts aren't in one transaction, so a failed audit log would
    // otherwise leave an orphan lot with no receive record — and a client retry
    // would then create a duplicate lot for the same batch. Roll the lot back so
    // the receive is all-or-nothing.
    await supabase.from('lab_lots').delete().eq('id', lot.id)
    return NextResponse.json({ error: logError.message }, { status: 500 })
  }
  return NextResponse.json({ data: lot })
}
