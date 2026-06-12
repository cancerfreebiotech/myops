import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isDocType } from '@/lib/procurement/doc-types'
import { VoidError, voidDocument, type VoidErrorCode } from '@/lib/procurement/void'
import { getProcurementAccess } from '@/app/api/procurement/products/helpers'

// Void (作廢) / void-and-clone (作廢並複製) a procurement document.
// POST /api/procurement/void/[docType]/[id]
// body: { reason: string, clone?: boolean }
// → { data: { doc_no, clone_id?, clone_doc_no? } }
//
// 409 when a goods receipt has live downstream docs — response carries their
// doc_nos in `downstream`.

const ERROR_STATUS: Record<VoidErrorCode, number> = {
  docNotFound: 404,
  voidNotAllowed: 400,
  downstreamNotVoided: 409,
  unpostFailed: 409,
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ docType: string; id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { docType, id } = await params

  if (!isDocType(docType)) {
    return NextResponse.json({ error: t('procurement.invalidDocType') }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { canRead } = await getProcurementAccess(supabase, user.id)
  if (!canRead) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  let body: { reason?: string; clone?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) {
    return NextResponse.json({ error: t('procurement.voidReasonRequired') }, { status: 400 })
  }

  try {
    const result = await voidDocument(docType, id, user.id, { reason, clone: body.clone === true })
    return NextResponse.json({
      data: {
        doc_no: result.docNo,
        ...(result.cloneId ? { clone_id: result.cloneId, clone_doc_no: result.cloneDocNo } : {}),
      },
    })
  } catch (e) {
    if (e instanceof VoidError) {
      const message =
        e.code === 'docNotFound'
          ? t('common.notFound')
          : e.code === 'downstreamNotVoided'
            ? t('procurement.downstreamNotVoided', { docs: (e.downstream ?? []).join(', ') })
            : t(`procurement.${e.code}` as Parameters<typeof t>[0])
      return NextResponse.json(
        { error: message, ...(e.downstream ? { downstream: e.downstream } : {}) },
        { status: ERROR_STATUS[e.code] }
      )
    }
    console.error('[procurement void] unexpected error:', e)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
}
