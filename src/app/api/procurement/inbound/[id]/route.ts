import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import {
  asTrimmedString,
  buildInboundItemRows,
  loadApprovalContext,
  parseInboundItems,
  requireInventoryUser,
} from '../helpers'

// 入庫單 detail:
// GET    /api/procurement/inbound/[id] — order + items + approval steps
// PUT    /api/procurement/inbound/[id] — update header/items (drafts only)
// DELETE /api/procurement/inbound/[id] — delete a draft

const ITEM_SELECT =
  'id, line_no, product_id, product_code, product_name, spec, unit, warehouse_id, ' +
  'warehouse_stock_id, stock_code, lot_no, expiry_date, quantity, notes, ' +
  'warehouse:warehouses(id, code, name)'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
  const auth = await requireInventoryUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const service = await createServiceClient()
  const { data: doc } = await service
    .from('inbound_orders')
    .select('*, gr:goods_receipts(id, doc_no)')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const { data: items, error: itemsError } = await service
    .from('inbound_items')
    .select(ITEM_SELECT)
    .eq('inbound_order_id', id)
    .order('line_no', { ascending: true, nullsFirst: false })

  if (itemsError) {
    console.error('[procurement inbound] items load failed:', itemsError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  try {
    const approval = await loadApprovalContext(service, 'inbound_order', id, doc as Record<string, unknown>, auth.user)
    return NextResponse.json({
      data: {
        doc: { ...(doc as Record<string, unknown>), created_by_name: approval.created_by_name },
        items: items ?? [],
        steps: approval.steps,
        can_act: approval.can_act,
        current_step_kind: approval.current_step_kind,
      },
    })
  } catch (e) {
    console.error('[procurement inbound] steps load failed:', e)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const ti = await getTranslations('procurement.inventory')
  const { id } = await params
  const auth = await requireInventoryUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const { data: doc } = await service
    .from('inbound_orders')
    .select('id, status, posted_at, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  if (doc.status !== 'draft' || doc.posted_at) {
    return NextResponse.json({ error: ti('errors.onlyDraftEditable') }, { status: 400 })
  }
  if (doc.created_by !== me.id && !me.canManage) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if ('order_date' in body) update.order_date = asTrimmedString(body.order_date)
  if ('notes' in body) update.notes = asTrimmedString(body.notes)
  if ('gr_doc_no' in body) {
    const grDocNo = asTrimmedString(body.gr_doc_no)
    if (grDocNo) {
      const { data: gr } = await service.from('goods_receipts').select('id').eq('doc_no', grDocNo).maybeSingle()
      if (!gr) return NextResponse.json({ error: ti('errors.grNotFound') }, { status: 404 })
      update.gr_id = gr.id
    } else {
      update.gr_id = null
    }
  }

  // full line-item replacement when `items` is provided
  if ('items' in body) {
    const items = parseInboundItems(body.items)
    if (items === null) return NextResponse.json({ error: ti('errors.itemInvalid') }, { status: 400 })

    const built = items.length > 0 ? await buildInboundItemRows(service, id, items) : { rows: [], hasNewLot: false }
    if ('missingProduct' in built) return NextResponse.json({ error: ti('errors.itemInvalid') }, { status: 400 })

    const { error: deleteError } = await service.from('inbound_items').delete().eq('inbound_order_id', id)
    if (deleteError) {
      console.error('[procurement inbound] items replace (delete) failed:', deleteError)
      return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
    }
    if (built.rows.length > 0) {
      const { error: insertError } = await service.from('inbound_items').insert(built.rows)
      if (insertError) {
        console.error('[procurement inbound] items replace (insert) failed:', insertError)
        return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
      }
    }
    update.is_new_lot = built.hasNewLot
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const { data, error } = await service
    .from('inbound_orders')
    .update({ ...update, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, doc_no, status')
    .single()

  if (error) {
    console.error('[procurement inbound] update failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const ti = await getTranslations('procurement.inventory')
  const { id } = await params
  const auth = await requireInventoryUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const { data: doc } = await service
    .from('inbound_orders')
    .select('id, status, posted_at, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  if (doc.status !== 'draft' || doc.posted_at) {
    return NextResponse.json({ error: ti('errors.onlyDraftDeletable') }, { status: 400 })
  }
  if (doc.created_by !== me.id && !me.canManage) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { error } = await service.from('inbound_orders').delete().eq('id', id)
  if (error) {
    console.error('[procurement inbound] delete failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data: { id } })
}
