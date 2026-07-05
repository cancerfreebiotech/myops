import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isValidDateString, taipeiToday } from '@/lib/taipei-date'

const CATEGORIES = ['it_equipment', 'instrument', 'furniture', 'other']
const STATUSES = ['in_use', 'idle', 'repair', 'retired']

async function canManage(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('asset_manage')
}

// GET /api/assets?category=&status=&due=1
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const status = searchParams.get('status')
  const due = searchParams.get('due')

  let query = supabase
    .from('assets')
    .select('*, custodian:users!assets_custodian_id_fkey(id, display_name)')
    .is('deleted_at', null)
    .order('asset_no')

  if (category && CATEGORIES.includes(category)) query = query.eq('category', category)
  if (status && STATUSES.includes(status)) query = query.eq('status', status)
  if (due === '1') {
    // 60 天內到期（校驗或保養）的資產
    const cutoff = new Date(new Date(taipeiToday()).getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    query = query
      .neq('status', 'retired')
      .or(`next_calibration_date.lte.${cutoff},next_maintenance_date.lte.${cutoff}`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/assets — 建立資產（admin / asset_manage）
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()
  const {
    asset_no, name, category, serial_no, location, custodian_id, status,
    purchase_date, purchase_amount, vendor_name, source_gr_id,
    calibration_cycle_months, next_calibration_date,
    maintenance_cycle_months, next_maintenance_date, note,
  } = body

  if (!asset_no?.trim() || !name?.trim() || !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  for (const d of [purchase_date, next_calibration_date, next_maintenance_date]) {
    if (d && !isValidDateString(d)) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      asset_no: asset_no.trim(),
      name: name.trim(),
      category,
      serial_no: serial_no || null,
      location: location || null,
      custodian_id: custodian_id || null,
      status: STATUSES.includes(status) ? status : 'in_use',
      purchase_date: purchase_date || null,
      purchase_amount: Number.isFinite(Number(purchase_amount)) && purchase_amount !== '' && purchase_amount !== null ? Number(purchase_amount) : null,
      vendor_name: vendor_name || null,
      source_gr_id: source_gr_id || null,
      calibration_cycle_months: calibration_cycle_months ? Number(calibration_cycle_months) : null,
      next_calibration_date: next_calibration_date || null,
      maintenance_cycle_months: maintenance_cycle_months ? Number(maintenance_cycle_months) : null,
      next_maintenance_date: next_maintenance_date || null,
      note: note || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
