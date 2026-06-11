import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import {
  EVAL_TABLE,
  VENDOR_EVAL_FIELDS,
  isEvalType,
  pickStringFields,
  requireProcurementUser,
} from '../helpers'

// Evaluation documents (Phase A end-to-end demo docs):
// GET  /api/procurement/evaluations/[type]   — list (type: 'vendor' | 'product')
// POST /api/procurement/evaluations/[type]   — create a draft

export async function GET(_request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const t = await getTranslations('apiErrors')
  const { type } = await params
  if (!isEvalType(type)) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const service = await createServiceClient()
  const select = type === 'vendor'
    ? 'id, doc_no, status, current_step, name, short_name, vendor_category, created_at, created_by, created_by_user:users!vendor_evaluations_created_by_fkey(id, display_name)'
    : 'id, doc_no, status, current_step, rfq_id, notes, created_at, created_by, rfq:rfqs(id, doc_no), created_by_user:users!product_evaluations_created_by_fkey(id, display_name)'

  const { data, error } = await service
    .from(EVAL_TABLE[type])
    .select(select)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[procurement evaluations] list failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const t = await getTranslations('apiErrors')
  const te = await getTranslations('procurement.evaluations')
  const { type } = await params
  if (!isEvalType(type)) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

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
  let insert: Record<string, unknown>

  if (type === 'vendor') {
    const fields = pickStringFields(body, VENDOR_EVAL_FIELDS)
    if (!fields.name) return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    insert = { ...fields, filled_by_id: me.id, created_by: me.id, updated_by: me.id }
  } else {
    // product evaluation: source RFQ referenced by its doc_no (來源詢價單號)
    let rfqId: string | null = null
    const rfqDocNo = typeof body.rfq_doc_no === 'string' ? body.rfq_doc_no.trim() : ''
    if (rfqDocNo) {
      const { data: rfq } = await service.from('rfqs').select('id').eq('doc_no', rfqDocNo).maybeSingle()
      if (!rfq) return NextResponse.json({ error: te('errors.rfqNotFound') }, { status: 404 })
      rfqId = rfq.id
    }
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
    insert = { rfq_id: rfqId, notes, created_by: me.id, updated_by: me.id }
  }

  const { data, error } = await service
    .from(EVAL_TABLE[type])
    .insert(insert)
    .select('id, doc_no, status')
    .single()

  if (error) {
    console.error('[procurement evaluations] create failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}
