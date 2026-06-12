import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getSignedDownloadUrl } from '@/lib/storage'
import { requireProcurementUser } from '../helpers'

// GET /api/procurement/payments/file?path=payments/... — short-lived signed
// download URL for a payment attachment in the `procurement` bucket.
//
// Static segment: takes precedence over /api/procurement/payments/[kind].

export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const path = request.nextUrl.searchParams.get('path')?.trim()
  // Only files this module wrote (payments/ prefix), no traversal
  if (!path || !path.startsWith('payments/') || path.includes('..')) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  try {
    const url = await getSignedDownloadUrl('procurement', path)
    return NextResponse.json({ data: { url } })
  } catch (e) {
    console.error('[procurement payments] signed download failed:', e)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
}
