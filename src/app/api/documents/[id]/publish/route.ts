import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendProactiveMessages } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase.from('users').select('role, granted_features').eq('id', user.id).single()
  const canPublish = currentUser?.role === 'admin' || currentUser?.granted_features?.includes('publish_announcement')
  if (!canPublish) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { recipient_user_ids, requires_confirmation, reminder_days } = await request.json()

  // 需真正繞過 RLS + documents_status_guard 才能發布：
  //   - documents_status_guard 只放行 is_admin()/approve_contract，會擋掉「僅具 publish_announcement」的發布者；
  //   - documents UPDATE RLS 同樣不含 publish_announcement。
  // 上方已做 canPublish 明確授權檢查（admin / publish_announcement），故此處用真 service-role client
  // 執行狀態變更（比照 documents/[id]/ocr route 的 createAdminClient 用法）。
  const admin = createAdminClient()

  // Approve the document
  const { error: updateError } = await admin.from('documents').update({
    status: 'approved',
    approved_by: user.id,
    approved_at: new Date().toISOString(),
  }).eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  // 向量索引（fire-and-forget；未設 embedding 時自動略過）
  {
    const { indexDocumentSafe } = await import('@/lib/doc-index')
    await indexDocumentSafe(admin, id)
  }

  // Create recipient records
  if (recipient_user_ids?.length) {
    const inserts = recipient_user_ids.map((uid: string) => ({
      document_id: id,
      user_id: uid,
      requires_confirmation: requires_confirmation ?? true,
      reminder_days: reminder_days ?? 3,
    }))
    const { error: recipientsError } = await service.from('document_recipients').insert(inserts)
    if (recipientsError) return NextResponse.json({ error: recipientsError.message }, { status: 400 })

    // T72: notify recipients who must read-and-confirm via Teams, in their own language.
    // Best-effort only — must never affect the publish response.
    if (requires_confirmation ?? true) {
      try {
        const [{ data: doc }, { data: recipients }] = await Promise.all([
          service.from('documents').select('title').eq('id', id).single(),
          service.from('users').select('id, language').in('id', recipient_user_ids),
        ])
        const title = doc?.title ?? ''
        const messages = (recipients ?? []).map((u) => ({
          userId: u.id,
          text: teamsText(u.language, 'newAnnouncement', { title }),
        }))
        if (messages.length) await sendProactiveMessages(messages)
      } catch (e) {
        console.error('T72: failed to send Teams announcement notifications', e)
      }
    }
  }

  // audit_logs 僅允許 service-role 寫入（無 authenticated INSERT policy），且 action 需在
  // audit_logs_action_check 允許集合內（無 'publish'）。發布即核准，記為合法的 'approve'。
  await admin.from('audit_logs').insert({
    doc_id: id,
    user_id: user.id,
    action: 'approve',
    detail: { recipient_count: recipient_user_ids?.length ?? 0 },
  })

  return NextResponse.json({ data: { ok: true } })
}
