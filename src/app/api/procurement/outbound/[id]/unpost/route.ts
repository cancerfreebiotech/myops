import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { requireInventoryUser, rpcErrorCode } from '../../../inbound/helpers'

// 沖銷過帳 (outbound) — revert a posting with reversing 'void' ledger movements
// (adds the deducted quantities back to warehouse_stock).
// POST /api/procurement/outbound/[id]/unpost

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const ti = await getTranslations('procurement.inventory')
  const { id } = await params
  const auth = await requireInventoryUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const me = auth.user

  const service = await createServiceClient()
  const { data: doc } = await service
    .from('outbound_orders')
    .select('id, doc_no, posted_at, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  if (doc.created_by !== me.id && !me.canManage) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }
  if (!doc.posted_at) {
    return NextResponse.json({ error: ti('errors.notPosted') }, { status: 409 })
  }

  const { error } = await service.rpc('unpost_outbound', { p_outbound_id: id, p_user_id: me.id })
  if (error) {
    const code = rpcErrorCode(error)
    if (code === 'P0003') return NextResponse.json({ error: ti('errors.notPosted') }, { status: 409 })
    if (code === 'P0005') return NextResponse.json({ error: t('procurement.unpostFailed') }, { status: 409 })
    if (code === 'P0002') return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
    console.error('[procurement outbound] unpost failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  const { data: updated } = await service
    .from('outbound_orders')
    .select('id, doc_no, status, posted_at, deducted_at')
    .eq('id', id)
    .single()
  return NextResponse.json({ data: updated })
}
