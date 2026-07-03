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

// GET /api/lab/supplies — 品項列表（含批次，批次依效期排序）
export async function GET() {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data, error } = await supabase
    .from('lab_supplies')
    .select('*, lots:lab_lots(*)')
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .order('expiry_date', { referencedTable: 'lots', ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/lab/supplies — 新增品項（admin / lab_manage）
// { name*, category*, catalog_no, vendor_name, storage_condition, unit, safety_stock, note }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManageLab(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()
  const { name, category, catalog_no, vendor_name, storage_condition, unit, safety_stock, note } = body

  if (typeof name !== 'string' || !name.trim() || !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  const numSafetyStock = safety_stock === undefined || safety_stock === null || safety_stock === ''
    ? 0
    : Number(safety_stock)
  if (!Number.isFinite(numSafetyStock) || numSafetyStock < 0) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('lab_supplies')
    .insert({
      name: name.trim(),
      category,
      catalog_no: strOrNull(catalog_no),
      vendor_name: strOrNull(vendor_name),
      storage_condition: STORAGE_CONDITIONS.includes(storage_condition) ? storage_condition : 'RT',
      unit: typeof unit === 'string' ? unit.trim() : '',
      safety_stock: numSafetyStock,
      note: strOrNull(note),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
