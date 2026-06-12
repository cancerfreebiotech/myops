import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import {
  PR_LIST_SELECT,
  computeTotals,
  normalizeItems,
  pickHeaderFields,
  requireProcurementUser,
} from './helpers'

// 請採購單 (purchase requests):
// GET  /api/procurement/purchase-requests — list (?status=&q=)
// POST /api/procurement/purchase-requests — create a draft (header + optional items)

export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const q = (searchParams.get('q') ?? '').trim()

  const service = await createServiceClient()
  let query = service
    .from('purchase_requests')
    .select(PR_LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(200)

  if (status && ['draft', 'in_approval', 'approved', 'rejected', 'voided'].includes(status)) {
    query = query.eq('status', status)
  }
  if (q) {
    const escaped = q.replaceAll('%', '\\%').replaceAll('_', '\\_').replaceAll(',', ' ')
    query = query.or(`doc_no.ilike.%${escaped}%,vendor_name.ilike.%${escaped}%`)
  }

  const { data, error } = await query
  if (error) {
    console.error('[procurement purchase-requests] list failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const tp = await getTranslations('procurement.purchaseRequests')

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const service = await createServiceClient()
  const header = pickHeaderFields(body)

  // referenced RFQ must exist when provided
  if (typeof header.rfq_id === 'string') {
    const { data: rfq } = await service.from('rfqs').select('id').eq('id', header.rfq_id).maybeSingle()
    if (!rfq) return NextResponse.json({ error: tp('errors.rfqNotFound') }, { status: 404 })
  }

  const items = 'items' in body ? normalizeItems(body.items) : []
  if (items === null) return NextResponse.json({ error: tp('errors.invalidItems') }, { status: 400 })

  if (items.length > 0) {
    Object.assign(header, computeTotals(
      items,
      typeof header.tax_rate === 'number' ? header.tax_rate : null,
      typeof header.shipping_fee === 'number' ? header.shipping_fee : null
    ))
  }

  const { data: doc, error: insertError } = await service
    .from('purchase_requests')
    .insert({ ...header, purchaser_id: header.purchaser_id ?? me.id, created_by: me.id, updated_by: me.id })
    .select('id, doc_no, status')
    .single()
  if (insertError || !doc) {
    console.error('[procurement purchase-requests] create failed:', insertError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  if (items.length > 0) {
    // strip any client-side row id — pr_items rows are always inserted fresh
    const rows = items.map(item => {
      const { id, ...rest } = item
      void id
      return {
        ...rest,
        pr_id: doc.id,
        received_qty: 0,
        pending_qty: item.quantity,
      }
    })
    const { error: itemsError } = await service.from('pr_items').insert(rows)
    if (itemsError) {
      console.error('[procurement purchase-requests] items insert failed:', itemsError)
      await service.from('purchase_requests').delete().eq('id', doc.id)
      return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
    }
  }

  return NextResponse.json({ data: doc })
}
