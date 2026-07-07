import { createAdminClient, createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // B3: 若指定關聯文件，驗證其存在、未刪除且屬於同一公司（防止關聯到任意/他公司文件）
  if (body.related_doc_id) {
    const { data: relDoc } = await service
      .from('documents')
      .select('company_id, deleted_at')
      .eq('id', body.related_doc_id)
      .maybeSingle()
    if (!relDoc || relDoc.deleted_at || relDoc.company_id !== (body.company_id ?? null)) {
      return NextResponse.json({ error: 'Invalid related_doc_id' }, { status: 400 })
    }
  }

  const { data, error } = await service.from('documents').insert({
    ...body,
    uploaded_by: user.id,
    status: body.doc_type === 'INTERNAL' ? 'approved' : 'pending',
    approved_by: body.doc_type === 'INTERNAL' ? user.id : null,
    approved_at: body.doc_type === 'INTERNAL' ? new Date().toISOString() : null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Audit log（audit_logs 為 service-role only，須用 admin client）
  await createAdminClient().from('audit_logs').insert({
    doc_id: data.id,
    user_id: user.id,
    action: 'upload',
    detail: { doc_type: data.doc_type, title: data.title },
  })

  return NextResponse.json({ data })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const folder = searchParams.get('folder')
  const doc_type = searchParams.get('doc_type')
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const company_id = searchParams.get('company_id')
  const page = parseInt(searchParams.get('page') ?? '1')
  const PAGE_SIZE = 20

  let query = supabase
    .from('documents')
    .select(`*, uploaded_by_user:users!documents_uploaded_by_fkey(id, display_name), company:companies(id, name), department:departments(id, name)`, { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (folder) query = query.eq('folder', folder)
  if (doc_type) query = query.eq('doc_type', doc_type)
  if (status) query = query.eq('status', status)
  if (search) {
    // 全文搜尋：標題 + OCR 抽取文字 + 三語內文。先移除會破壞 or() 語法的字元（, ( ) *）
    const safe = search.replace(/[,()*]/g, ' ').trim()
    if (safe) {
      const pat = `*${safe}*`
      query = query.or(
        `title.ilike.${pat},ocr_text.ilike.${pat},content_zh.ilike.${pat},content_en.ilike.${pat},content_ja.ilike.${pat}`
      )
    }
  }
  if (company_id) query = query.eq('company_id', company_id)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count })
}
