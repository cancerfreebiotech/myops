import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
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
  const write = procurementWriteClient()

  // Build item rows first (validates stock refs). FK injected by the RPC, so the
  // placeholder order id is overwritten.
  let itemRows: Record<string, unknown>[] = []
  if (items.length > 0) {
    const built = await buildOutboundItemRows(service, '', items)
    if ('missingStock' in built) {
      return NextResponse.json({ error: ti('errors.stockNotFound') }, { status: 404 })
    }
    itemRows = built.rows
  }

  // atomic header+items insert (doc_no via trigger); no orphan on partial failure
  const { data: order, error: orderError } = await write.rpc('procurement_insert_with_items', {
    p_parent_table: 'outbound_orders',
    p_parent: {
      order_date: asTrimmedString(body.order_date),
      shipment_no: asTrimmedString(body.shipment_no),
      notes: asTrimmedString(body.notes),
      created_by: me.id,
      updated_by: me.id,
    },
    p_item_table: 'outbound_items',
    p_fk_column: 'outbound_order_id',
    p_items: itemRows,
  })
  if (orderError || !order) {
    console.error('[procurement outbound] create failed:', orderError)
    return NextResponse.json({ error: isWritePermissionError(orderError) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
  }

  return NextResponse.json({ data: { id: order.id, doc_no: order.doc_no, status: order.status } })
}
