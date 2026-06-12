import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { randomUUID } from 'crypto'
import { getSignedUploadUrl } from '@/lib/storage'
import { requireProcurementUser } from '../helpers'

// POST /api/procurement/payments/upload — presigned upload URL for payment
// attachments (分期請款 發票檔案) in the `procurement` storage bucket.
// body: { filename: string } → { data: { signedUrl, token, path } }
//
// Static segment: takes precedence over /api/procurement/payments/[kind].

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  let body: { filename?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const ext = body.filename?.split('.').pop()?.replace(/[^A-Za-z0-9]/g, '') || 'bin'
  const path = `payments/${randomUUID()}.${ext}`

  try {
    const data = await getSignedUploadUrl('procurement', path)
    return NextResponse.json({ data: { ...data, path } })
  } catch (e) {
    console.error('[procurement payments] presigned upload failed:', e)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
}
