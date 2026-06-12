import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import {
  asTrimmedString,
  buildOutboundItemRows,
  parseOutboundItems,
  requireInventoryUser,
} from '../inbound/helpers'

// 出庫單 (outbound orders, quantities in 庫存單位):
// GET  /api/procurement/outbound — list (procurement_unit | procurement_manage | admin)
// POST /api/procurement/outbound — create a draft with line items
//   body: { order_date?, shipment_no?, notes?, items: [{ warehouse_stock_id? |
//           stock_code?, used_qty, notes? }] }
//   Stock sufficiency is only hinted client-side; post_outbound enforces it.

const LIST_SELECT =
  'id, doc_no, status, current_step, order_date, shipment_no, posted_at, deducted_at, notes, created_at, created_by, ' +
  'created_by_user:users!outbound_orders_created_by_fkey(id, display_name), ' +
  'items:outbound_items(count)'

export async function GET() {
  const t = await getTranslations('apiErrors')
  const auth = await requireInventoryUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from('outbound_orders')
    .select(LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[procurement outbound] list failed:', error)
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

  const items = parseOutboundItems(body.items ?? [])
  if (items === null) return NextResponse.json({ error: ti('errors.itemInvalid') }, { status: 400 })

  const service = await createServiceClient()
  const { data: order, error: orderError } = await service
    .from('outbound_orders')
    .insert({
      order_date: asTrimmedString(body.order_date),
      shipment_no: asTrimmedString(body.shipment_no),
      notes: asTrimmedString(body.notes),
      created_by: me.id,
      updated_by: me.id,
    })
    .select('id, doc_no, status')
    .single()

  if (orderError || !order) {
    console.error('[procurement outbound] create failed:', orderError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  if (items.length > 0) {
    const built = await buildOutboundItemRows(service, order.id, items)
    if ('missingStock' in built) {
      await service.from('outbound_orders').delete().eq('id', order.id)
      return NextResponse.json({ error: ti('errors.stockNotFound') }, { status: 404 })
    }
    const { error: itemsError } = await service.from('outbound_items').insert(built.rows)
    if (itemsError) {
      console.error('[procurement outbound] items insert failed:', itemsError)
      await service.from('outbound_orders').delete().eq('id', order.id)
      return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
    }
  }

  return NextResponse.json({ data: order })
}
