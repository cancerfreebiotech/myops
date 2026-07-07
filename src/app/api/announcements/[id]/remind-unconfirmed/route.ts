import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { sendProactiveMessages } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'

// B4: 公告一鍵催人 — 對尚未確認該公告的收件者發 Teams 提醒。
// 唯讀通知動作，不需 MFA aal2（比照 daily-digest，非比照 confirm）。
// 權限沿用 publish_announcement / admin。
// 防濫發：documents.last_reminded_at 做 4 小時冷卻。
const COOLDOWN_MS = 4 * 60 * 60 * 1000

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const canPublish = currentUser?.role === 'admin' ||
    currentUser?.granted_features?.includes('publish_announcement')
  if (!canPublish) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  // 公告必須存在、為 ANN/REG、已核准、未刪除
  const { data: doc } = await service
    .from('documents')
    .select('id, title, last_reminded_at')
    .eq('id', id)
    .in('doc_type', ['ANN', 'REG'])
    .eq('status', 'approved')
    .is('deleted_at', null)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  // 冷卻：距上次提醒未滿 COOLDOWN_MS 則擋下
  if (doc.last_reminded_at && Date.now() - new Date(doc.last_reminded_at).getTime() < COOLDOWN_MS) {
    return NextResponse.json({ error: 'rate_limited', code: 'RATE_LIMITED' }, { status: 429 })
  }

  // 需確認但尚未確認的收件者
  const { data: pending } = await service
    .from('document_recipients')
    .select('user_id')
    .eq('document_id', id)
    .eq('requires_confirmation', true)
    .is('confirmed_at', null)

  const userIds = [...new Set((pending ?? []).map((r) => r.user_id))]
  if (userIds.length === 0) {
    return NextResponse.json({ data: { sent: 0, failed: 0, total: 0 } })
  }

  // 僅通知在職者，各自語言
  const { data: recipients } = await service
    .from('users')
    .select('id, language')
    .in('id', userIds)
    .eq('is_active', true)

  const messages = (recipients ?? []).map((u) => ({
    userId: u.id,
    text: teamsText(u.language, 'announcementReminder', { title: doc.title }),
  }))

  let sent = 0
  let failed = 0
  if (messages.length) {
    try {
      ;({ sent, failed } = await sendProactiveMessages(messages))
    } catch (e) {
      console.error('[B4 remind-unconfirmed] send error:', e)
      failed = messages.length
    }
  }

  // 只在確實送出至少一封時才蓋冷卻時間戳（送全失敗不應鎖住重試）；
  // 並以「last_reminded_at 仍為讀取時的值」為條件更新，降低並發 TOCTOU 重複發送。
  // 用真 service-role client 寫入：documents UPDATE RLS 僅放行 uploaded_by/admin/approve_contract，
  // 不含 publish_announcement，若用帶使用者 JWT 的 service client，非上傳者身分的發布者會命中 0 列
  // 且不報錯 → 冷卻戳永遠寫不進去 → 4 小時冷卻可被無限繞過。上方已做 canPublish 授權檢查。
  if (sent > 0) {
    const admin = createAdminClient()
    let stamp = admin.from('documents').update({ last_reminded_at: new Date().toISOString() }).eq('id', id)
    stamp = doc.last_reminded_at
      ? stamp.eq('last_reminded_at', doc.last_reminded_at)
      : stamp.is('last_reminded_at', null)
    const { error: stampErr, data: stamped } = await stamp.select('id')
    if (stampErr) console.error('[B4 remind-unconfirmed] cooldown stamp failed:', stampErr)
    else if (!stamped?.length) console.warn('[B4 remind-unconfirmed] cooldown stamp hit 0 rows (concurrent remind?)')
  }

  // 稽核（best-effort，與 publish/confirm route 一致，不檢查錯誤）；audit_logs 為 service-role only
  await createAdminClient().from('audit_logs').insert({
    doc_id: id,
    user_id: user.id,
    action: 'remind',
    detail: { unconfirmed: userIds.length, sent, failed },
  })

  return NextResponse.json({ data: { sent, failed, total: messages.length } })
}
