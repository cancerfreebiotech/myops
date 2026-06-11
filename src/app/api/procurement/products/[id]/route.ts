import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getProcurementAccess, pickWritable } from '../helpers'

// Products master (採購_商品清冊) — single product
// GET    /api/procurement/products/[id]   read: procurement_unit | procurement_manage | admin
// PATCH  /api/procurement/products/[id]   write: procurement_manage | admin
// DELETE /api/procurement/products/[id]   soft delete — write: procurement_manage | admin

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { canRead } = await getProcurementAccess(supabase, user.id)
  if (!canRead) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { data, error } = await service
    .from('products')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[procurement products] get error:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const t = await getTranslations('apiErrors')
  const tp = await getTranslations('procurement.products')
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

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

  const { data: existing } = await service
    .from('products')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const payload = pickWritable(body)
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  if ('name' in payload && (typeof payload.name !== 'string' || !payload.name.trim())) {
    return NextResponse.json({ error: tp('errors.nameRequired') }, { status: 400 })
  }

  if ('units_per_purchase' in payload) {
    const rate = Number(payload.units_per_purchase)
    if (payload.units_per_purchase == null || !Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: tp('errors.invalidUnitsPerPurchase') }, { status: 400 })
    }
    payload.units_per_purchase = rate
  }

  const { data, error } = await service
    .from('products')
    .update({ ...payload, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: tp('errors.duplicateCode') }, { status: 400 })
    }
    console.error('[procurement products] update error:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { canWrite } = await getProcurementAccess(supabase, user.id)
  if (!canWrite) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { data: existing } = await service
    .from('products')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  // Soft delete — recoverable, keeps FK references from documents/stock intact
  const { error } = await service
    .from('products')
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[procurement products] delete error:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  return NextResponse.json({ data: { ok: true } })
}
