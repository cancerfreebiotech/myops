import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  const { data, error } = await service.from('documents').insert({
    ...body,
    uploaded_by: user.id,
    status: body.doc_type === 'INTERNAL' ? 'approved' : 'pending',
    approved_by: body.doc_type === 'INTERNAL' ? user.id : null,
    approved_at: body.doc_type === 'INTERNAL' ? new Date().toISOString() : null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Audit log
  await service.from('audit_logs').insert({
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
  if (search) query = query.ilike('title', `%${search}%`)
  if (company_id) query = query.eq('company_id', company_id)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count })
}
