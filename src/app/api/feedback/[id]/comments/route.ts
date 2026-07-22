import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// 授權：admin 或該回饋提交者本人。
async function authorize(id: string) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: t('common.unauthorized') }, { status: 401 }) }

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin'

  // createServiceClient 帶使用者 JWT（RLS 生效）；讀取父回饋以做應用層授權檢查。
  const { data: fb, error: fbErr } = await service
    .from('feedback')
    .select('id, submitted_by, status')
    .eq('id', id)
    .single()
  if (fbErr || !fb) return { error: NextResponse.json({ error: t('common.notFound') }, { status: 404 }) }

  const isSubmitter = fb.submitted_by === user.id
  if (!isAdmin && !isSubmitter) return { error: NextResponse.json({ error: t('common.forbidden') }, { status: 403 }) }

  return { user, service, feedback: fb, isSubmitter }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authorize(id)
  if ('error' in auth) return auth.error
  const { service } = auth

  const { data, error } = await service
    .from('feedback_comments')
    .select('id, body, created_at, author:users!feedback_comments_author_id_fkey(id, display_name)')
    .eq('feedback_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
  const auth = await authorize(id)
  if ('error' in auth) return auth.error
  const { user, service, feedback, isSubmitter } = auth

  const { body } = await request.json()
  if (!body || typeof body !== 'string' || !body.trim()) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  // 寫入走 createServiceClient（RLS INSERT 政策已放行 admin / 提交者，並強制 author_id = auth.uid()）。
  const { data: comment, error } = await service
    .from('feedback_comments')
    .insert({ feedback_id: id, author_id: user.id, body: body.trim() })
    .select('id, body, created_at, author:users!feedback_comments_author_id_fkey(id, display_name)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // 提交者留言且回饋為 rejected / done → 重新開啟（讓「退回後可以再說明」成立）。
  // feedback UPDATE 的 RLS 僅 admin，故提交者的重開需走真 service-role（createAdminClient），
  // 上方已完成應用層授權檢查（確認呼叫者即為該回饋提交者）。
  let reopened = false
  if (isSubmitter && (feedback.status === 'rejected' || feedback.status === 'done')) {
    const admin = createAdminClient()
    const { error: upErr } = await admin.from('feedback').update({ status: 'open' }).eq('id', id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
    reopened = true
  }

  return NextResponse.json({ data: comment, reopened })
}
