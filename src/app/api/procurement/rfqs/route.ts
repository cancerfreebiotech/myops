import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { type DocStatus, DOC_STATUSES } from '@/lib/procurement/doc-types'
import {
  RFQ_LIST_SELECT,
  pickRfqFields,
  requireProcurementUser,
} from './helpers'

// 詢價單 (RFQ):
// GET  /api/procurement/rfqs — list with filters
//   ?status=draft|in_approval|approved|rejected|voided
//   ?q=<doc_no / department ilike>
//   ?inquirer=me — only documents where I am the 詢價人員
// POST /api/procurement/rfqs — create a draft (doc_no auto via trigger)

function escapeLike(value: string): string {
  return value.replaceAll('%', '\\%').replaceAll('_', '\\_')
}

export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')

  const auth = await requireProcurementUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const q = searchParams.get('q')?.trim() ?? ''
  const inquirer = searchParams.get('inquirer')

  const service = await createServiceClient()
  let query = service
    .from('rfqs')
    .select(RFQ_LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(200)

  if (status && (DOC_STATUSES as readonly string[]).includes(status)) {
    query = query.eq('status', status as DocStatus)
  }
  if (q) {
    const pattern = `%${escapeLike(q)}%`
    query = query.or(`doc_no.ilike.${pattern},requesting_department.ilike.${pattern},department.ilike.${pattern}`)
  }
  if (inquirer === 'me') {
    query = query.eq('inquirer_id', auth.user.id)
  }

  const { data, error } = await query
  if (error) {
    console.error('[procurement rfqs] list failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')

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

  const { fields, invalid } = pickRfqFields(body)
  if (invalid) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const write = procurementWriteClient()
  const { data, error } = await write
    .from('rfqs')
    .insert({ ...fields, created_by: me.id, updated_by: me.id })
    .select('id, doc_no, status')
    .single()

  if (error) {
    console.error('[procurement rfqs] create failed:', error)
    return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}
