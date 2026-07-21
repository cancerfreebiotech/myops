import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import {
  PAYMENT_TABLE,
  applyVendorInfo,
  isPaymentKind,
  pickPaymentFields,
  requireProcurementUser,
  type PaymentKind,
} from '../helpers'

// 請款三單 (payment requests):
// GET  /api/procurement/payments/[kind]   — list (kind: 'deposit' | 'ap' | 'installment')
// POST /api/procurement/payments/[kind]   — create a draft
//
// Documents are normally born through /api/procurement/convert
// (PR→DEP, GR→AP, AP→INS); POST supports standalone drafts referencing the
// source document by doc_no.

const LIST_SELECT: Record<PaymentKind, string> = {
  deposit:
    'id, doc_no, status, current_step, vendor_name, vendor_short_name, deposit_amount, total_amount, remittance_deadline, created_at, created_by, ' +
    'pr:purchase_requests(id, doc_no), created_by_user:users!deposit_requests_created_by_fkey(id, display_name)',
  ap:
    'id, doc_no, status, current_step, vendor_name, billing_month, total_amount, is_installment, created_at, created_by, ' +
    'gr:goods_receipts(id, doc_no), created_by_user:users!ap_requests_created_by_fkey(id, display_name)',
  installment:
    'id, doc_no, status, current_step, installment_no, billing_month, amount, invoice_no, created_at, created_by, ' +
    'ap:ap_requests(id, doc_no), created_by_user:users!installment_requests_created_by_fkey(id, display_name)',
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const t = await getTranslations('apiErrors')
  const { kind } = await params
  if (!isPaymentKind(kind)) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from(PAYMENT_TABLE[kind])
    .select(LIST_SELECT[kind])
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[procurement payments] list failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const t = await getTranslations('apiErrors')
  const tp = await getTranslations('procurement.payments')
  const { kind } = await params
  if (!isPaymentKind(kind)) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

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
  const write = procurementWriteClient()
  const insert: Record<string, unknown> = {
    ...pickPaymentFields(body, kind),
    created_by: me.id,
    updated_by: me.id,
  }

  // Optional / required source document reference by doc_no
  if (kind === 'deposit' && typeof body.pr_doc_no === 'string' && body.pr_doc_no.trim()) {
    const { data: pr } = await service.from('purchase_requests').select('id').eq('doc_no', body.pr_doc_no.trim()).maybeSingle()
    if (!pr) return NextResponse.json({ error: tp('errors.sourceNotFound') }, { status: 404 })
    insert.pr_id = pr.id
  }
  if (kind === 'ap' && typeof body.gr_doc_no === 'string' && body.gr_doc_no.trim()) {
    const { data: gr } = await service.from('goods_receipts').select('id').eq('doc_no', body.gr_doc_no.trim()).maybeSingle()
    if (!gr) return NextResponse.json({ error: tp('errors.sourceNotFound') }, { status: 404 })
    insert.gr_id = gr.id
  }
  if (kind === 'installment') {
    // 分期請款單 must hang off an AP request (規格規則 1: 採購請款單 → 建立分期請款)
    const apId = typeof body.ap_id === 'string' ? body.ap_id.trim() : ''
    const apDocNo = typeof body.ap_doc_no === 'string' ? body.ap_doc_no.trim() : ''
    if (!apId && !apDocNo) return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })

    const query = service.from('ap_requests').select('id, billing_month')
    const { data: ap } = apId
      ? await query.eq('id', apId).maybeSingle()
      : await query.eq('doc_no', apDocNo).maybeSingle()
    if (!ap) return NextResponse.json({ error: tp('errors.sourceNotFound') }, { status: 404 })

    insert.ap_id = ap.id
    if (insert.billing_month == null) insert.billing_month = ap.billing_month
    // System-assigned 期數: count of the AP's non-voided installments + 1
    const { count } = await service
      .from('installment_requests')
      .select('id', { count: 'exact', head: true })
      .eq('ap_id', ap.id)
      .neq('status', 'voided')
    insert.installment_no = (count ?? 0) + 1
  }

  // 從廠商主檔帶入 bank / payment info for deposit & ap drafts
  if ((kind === 'deposit' || kind === 'ap') && typeof body.vendor_id === 'string' && body.vendor_id.trim()) {
    const ok = await applyVendorInfo(service, kind, body.vendor_id.trim(), insert, new Set(Object.keys(body)))
    if (!ok) return NextResponse.json({ error: tp('errors.vendorNotFound') }, { status: 404 })
  }

  const { data, error } = await write
    .from(PAYMENT_TABLE[kind])
    .insert(insert)
    .select('id, doc_no, status')
    .single()

  if (error) {
    console.error('[procurement payments] create failed:', error)
    return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}
