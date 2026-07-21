import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { requireInventoryUser, rpcErrorCode } from '../../helpers'
import { applyInboundReceipt } from '@/lib/procurement/receipt-progress'

// 庫存過帳 (inbound) — apply the order to warehouse_stock + ledger.
// POST /api/procurement/inbound/[id]/post
// Requires the document to be approved (簽核完成) and not yet posted.
// Calls the SECURITY DEFINER fn post_inbound via the service client; the fn
// matches existing lots / creates new lot rows atomically (migration 000011).

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const ti = await getTranslations('procurement.inventory')
  const { id } = await params
  const auth = await requireInventoryUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const write = procurementWriteClient()
  const { data: doc } = await service
    .from('inbound_orders')
    .select('id, doc_no, status, posted_at, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  if (doc.created_by !== me.id && !me.canManage) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }
  if (doc.status !== 'approved') {
    return NextResponse.json({ error: ti('errors.notApprovedForPosting') }, { status: 409 })
  }
  if (doc.posted_at) {
    return NextResponse.json({ error: ti('errors.alreadyPosted') }, { status: 409 })
  }

  const { error } = await write.rpc('post_inbound', { p_inbound_id: id, p_user_id: me.id })
  if (error) {
    const code = rpcErrorCode(error)
    if (code === 'P0003') return NextResponse.json({ error: ti('errors.alreadyPosted') }, { status: 409 })
    if (code === 'P0004') return NextResponse.json({ error: ti('errors.postValidationFailed') }, { status: 400 })
    if (code === 'P0002') return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
    if (code === '42501') return NextResponse.json({ error: t('common.noWritePermission') }, { status: 500 })
    console.error('[procurement inbound] post failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  // Sync the upstream PR's 已進貨/尚未進貨 progress (best-effort; never blocks posting)
  await applyInboundReceipt(service, write, id, 'post')

  const { data: updated } = await service
    .from('inbound_orders')
    .select('id, doc_no, status, posted_at, stocked_at')
    .eq('id', id)
    .single()
  return NextResponse.json({ data: updated })
}
