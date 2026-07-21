import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { requireProcurementUser } from '@/app/api/procurement/evaluations/helpers'
import { GR_LIST_SELECT, canEditVendorCode, pickGoodsReceiptFields } from './helpers'

// 進貨驗收單 (goods receipts):
// GET  /api/procurement/goods-receipts — list (newest first)
// POST /api/procurement/goods-receipts — create a draft
//   body: optional pr_doc_no (來源採購單號) + any whitelisted GR columns.
//   doc_no is auto-assigned by the next_doc_no BEFORE INSERT trigger (GR-YYMM-NNN).

export async function GET() {
  const t = await getTranslations('apiErrors')

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from('goods_receipts')
    .select(GR_LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[procurement goods-receipts] list failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const tg = await getTranslations('procurement.goodsReceipts')

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

  const picked = pickGoodsReceiptFields(body)
  if (!picked.ok) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  const fields = picked.fields

  // Spec rule 1: 廠商編號 read-only without procurement_unit / procurement_manage
  if ('vendor_code' in fields && !canEditVendorCode(me)) {
    return NextResponse.json({ error: tg('errors.vendorCodeReadonly') }, { status: 403 })
  }

  const service = await createServiceClient()
  const write = procurementWriteClient()

  // Optional source PR referenced by its doc_no (來自採購單號)
  if (typeof body.pr_doc_no === 'string' && body.pr_doc_no.trim()) {
    const { data: pr } = await service
      .from('purchase_requests')
      .select('id')
      .eq('doc_no', body.pr_doc_no.trim())
      .maybeSingle()
    if (!pr) return NextResponse.json({ error: tg('errors.prNotFound') }, { status: 404 })
    fields.pr_id = pr.id
  }

  const { data, error } = await write
    .from('goods_receipts')
    .insert({
      ...fields,
      receiver_id: me.id, // 進貨人員 defaults to the creator
      created_by: me.id,
      updated_by: me.id,
    })
    .select('id, doc_no, status')
    .single()

  if (error) {
    console.error('[procurement goods-receipts] create failed:', error)
    return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}
