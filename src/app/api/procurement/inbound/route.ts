import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
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
  const write = procurementWriteClient()

  // optional source goods receipt referenced by doc_no (進貨驗收編號)
  let grId: string | null = null
  const grDocNo = asTrimmedString(body.gr_doc_no)
  if (grDocNo) {
    const { data: gr } = await service.from('goods_receipts').select('id').eq('doc_no', grDocNo).maybeSingle()
    if (!gr) return NextResponse.json({ error: ti('errors.grNotFound') }, { status: 404 })
    grId = gr.id
    // 擱置 GR→入庫防重：分批入庫可能是合理流程，待確認採購規則（2026-07-11 Luna）
  }

  // Build item rows first (validates products + computes hasNewLot). The parent
  // FK is injected by the RPC, so the placeholder order id here is overwritten.
  let itemRows: Record<string, unknown>[] = []
  let hasNewLot = false
  if (items.length > 0) {
    const built = await buildInboundItemRows(service, '', items)
    if ('missingProduct' in built) {
      return NextResponse.json({ error: ti('errors.itemInvalid') }, { status: 400 })
    }
    itemRows = built.rows
    hasNewLot = built.hasNewLot
  }

  // atomic header+items insert (doc_no via trigger); is_new_lot folded into the
  // header so there is no separate follow-up update, and no orphan on failure.
  const { data: order, error: orderError } = await write.rpc('procurement_insert_with_items', {
    p_parent_table: 'inbound_orders',
    p_parent: {
      gr_id: grId,
      order_date: asTrimmedString(body.order_date),
      notes: asTrimmedString(body.notes),
      is_new_lot: hasNewLot,
      created_by: me.id,
      updated_by: me.id,
    },
    p_item_table: 'inbound_items',
    p_fk_column: 'inbound_order_id',
    p_items: itemRows,
  })
  if (orderError || !order) {
    console.error('[procurement inbound] create failed:', orderError)
    return NextResponse.json({ error: isWritePermissionError(orderError) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
  }

  return NextResponse.json({ data: { id: order.id, doc_no: order.doc_no, status: order.status } })
}
