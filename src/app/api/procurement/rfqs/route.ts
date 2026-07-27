import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { isWritePermissionError } from '@/lib/procurement/errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { type DocStatus, DOC_STATUSES } from '@/lib/procurement/doc-types'
import {
  RFQ_LIST_SELECT,
  pickRfqFields,
  pickRfqItems,
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

  // 建檔時可一併帶入請購商品（草稿階段無鎖定）
  let items: Record<string, unknown>[] = []
  if ('items' in body) {
    const r = pickRfqItems(body.items)
    if (r.invalid) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    items = r.items
  }

  const write = procurementWriteClient()
  const parent = { ...fields, created_by: me.id, updated_by: me.id }

  if (items.length > 0) {
    // 表頭 + 明細原子寫入（doc_no 由 trigger 產生，RPC 回傳整列）
    const { data: rpcData, error } = await write.rpc('procurement_insert_with_items', {
      p_parent_table: 'rfqs',
      p_parent: parent,
      p_item_table: 'rfq_items',
      p_fk_column: 'rfq_id',
      p_items: items,
    })
    if (error || !rpcData) {
      console.error('[procurement rfqs] create with items failed:', error)
      return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
    }
    return NextResponse.json({ data: { id: rpcData.id, doc_no: rpcData.doc_no, status: rpcData.status } })
  }

  const { data, error } = await write
    .from('rfqs')
    .insert(parent)
    .select('id, doc_no, status')
    .single()

  if (error) {
    console.error('[procurement rfqs] create failed:', error)
    return NextResponse.json({ error: isWritePermissionError(error) ? t('common.noWritePermission') : t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}
