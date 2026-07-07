import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isDocType } from '@/lib/procurement/doc-types'
import { ConversionError, convertDoc, type ConversionErrorCode } from '@/lib/procurement/conversions'
import { getProcurementAccess } from '@/app/api/procurement/products/helpers'

// Document conversion (轉單) for the six procurement chains.
// POST /api/procurement/convert
// body: { fromType: DocType, fromId: string, toType: DocType }
// → { data: { id, doc_no, to_type } } — the newly created draft target document.
//
// Requires procurement_unit / procurement_manage / admin. The source document
// must be status='approved' (the engine enforces this).

const ERROR_STATUS: Record<ConversionErrorCode, number> = {
  invalidConversion: 400,
  docNotFound: 404,
  sourceNotApproved: 409,
  alreadyConverted: 409,
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { canRead } = await getProcurementAccess(supabase, user.id)
  if (!canRead) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  let body: { fromType?: string; fromId?: string; toType?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }
  const { fromType, fromId, toType } = body

  if (!fromType || !toType || !fromId || !isDocType(fromType) || !isDocType(toType)) {
    return NextResponse.json({ error: t('procurement.invalidDocType') }, { status: 400 })
  }

  try {
    const result = await convertDoc(fromType, fromId, toType, user.id)
    return NextResponse.json({ data: { id: result.newId, doc_no: result.docNo, to_type: result.toType } })
  } catch (e) {
    if (e instanceof ConversionError) {
      const message = e.code === 'docNotFound'
        ? t('common.notFound')
        // No dedicated i18n key: reuse the generic 「不支援此轉單組合」 message
        // (the block is a duplicate/invalid conversion of an already-converted GR).
        : e.code === 'alreadyConverted'
          ? t('procurement.invalidConversion')
          : t(`procurement.${e.code}` as Parameters<typeof t>[0])
      return NextResponse.json({ error: message }, { status: ERROR_STATUS[e.code] })
    }
    console.error('[procurement convert] unexpected error:', e)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
}
