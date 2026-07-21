import { createClient, createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { escapeLike, getProcurementAccess, pickWritable } from './helpers'

// Products master (採購_商品清冊) — list + create
// GET  /api/procurement/products?q=...   read: procurement_unit | procurement_manage | admin
// POST /api/procurement/products          write: procurement_manage | admin

export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { canRead } = await getProcurementAccess(supabase, user.id)
  if (!canRead) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const q = request.nextUrl.searchParams.get('q')?.trim()

  let query = service
    .from('products')
    .select('*')
    .is('deleted_at', null)
    .order('product_code', { ascending: true, nullsFirst: false })

  if (q) {
    const like = `%${escapeLike(q)}%`
    query = query.or(
      `product_code.ilike.${like},name.ilike.${like},category.ilike.${like},brand.ilike.${like},item_code.ilike.${like}`
    )
  }

  const { data, error } = await query
  if (error) {
    console.error('[procurement products] list error:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const tp = await getTranslations('procurement.products')
  const supabase = await createClient()
  const write = procurementWriteClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { canWrite } = await getProcurementAccess(supabase, user.id)
  if (!canWrite) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const payload = pickWritable(body)

  if (typeof payload.name !== 'string' || !payload.name.trim()) {
    return NextResponse.json({ error: tp('errors.nameRequired') }, { status: 400 })
  }

  if (payload.units_per_purchase != null) {
    const rate = Number(payload.units_per_purchase)
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: tp('errors.invalidUnitsPerPurchase') }, { status: 400 })
    }
    payload.units_per_purchase = rate
  } else {
    payload.units_per_purchase = 1
  }

  const { data, error } = await write
    .from('products')
    .insert({ ...payload, created_by: user.id, updated_by: user.id })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: tp('errors.duplicateCode') }, { status: 400 })
    }
    console.error('[procurement products] create error:', error)
    return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
  }

  return NextResponse.json({ data })
}
