import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import {
  asTrimmedString,
  buildInboundItemRows,
  parseInboundItems,
  requireInventoryUser,
} from './helpers'

// 入庫單 (inbound orders, quantities in 庫存單位):
// GET  /api/procurement/inbound — list (procurement_unit | procurement_manage | admin)
// POST /api/procurement/inbound — create a draft with line items
//   body: { gr_doc_no?, order_date?, notes?, items: [{ product_id, warehouse_id,
//           lot_no?, expiry_date?, quantity, notes? }] }
//   is_new_lot is decided by the system per document (plan decision 8).

const LIST_SELECT =
  'id, doc_no, status, current_step, gr_id, is_new_lot, order_date, posted_at, stocked_at, notes, created_at, created_by, ' +
  'gr:goods_receipts(id, doc_no), ' +
  'created_by_user:users!inbound_orders_created_by_fkey(id, display_name), ' +
  'items:inbound_items(count)'

export async function GET() {
  const t = await getTranslations('apiErrors')
  const auth = await requireInventoryUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from('inbound_orders')
    .select(LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[procurement inbound] list failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const ti = await getTranslations('procurement.inventory')
  const auth = await requireInventoryUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const items = parseInboundItems(body.items ?? [])
  if (items === null) return NextResponse.json({ error: ti('errors.itemInvalid') }, { status: 400 })

  const service = await createServiceClient()

  // optional source goods receipt referenced by doc_no (進貨驗收編號)
  let grId: string | null = null
  const grDocNo = asTrimmedString(body.gr_doc_no)
  if (grDocNo) {
    const { data: gr } = await service.from('goods_receipts').select('id').eq('doc_no', grDocNo).maybeSingle()
    if (!gr) return NextResponse.json({ error: ti('errors.grNotFound') }, { status: 404 })
    grId = gr.id
    // 擱置 GR→入庫防重：分批入庫可能是合理流程，待確認採購規則（2026-07-11 Luna）
  }

  const { data: order, error: orderError } = await service
    .from('inbound_orders')
    .insert({
      gr_id: grId,
      order_date: asTrimmedString(body.order_date),
      notes: asTrimmedString(body.notes),
      created_by: me.id,
      updated_by: me.id,
    })
    .select('id, doc_no, status')
    .single()

  if (orderError || !order) {
    console.error('[procurement inbound] create failed:', orderError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  if (items.length > 0) {
    const built = await buildInboundItemRows(service, order.id, items)
    if ('missingProduct' in built) {
      await service.from('inbound_orders').delete().eq('id', order.id)
      return NextResponse.json({ error: ti('errors.itemInvalid') }, { status: 400 })
    }
    const { error: itemsError } = await service.from('inbound_items').insert(built.rows)
    if (itemsError) {
      console.error('[procurement inbound] items insert failed:', itemsError)
      await service.from('inbound_orders').delete().eq('id', order.id)
      return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
    }
    if (built.hasNewLot) {
      await service.from('inbound_orders').update({ is_new_lot: true }).eq('id', order.id)
    }
  }

  return NextResponse.json({ data: order })
}
