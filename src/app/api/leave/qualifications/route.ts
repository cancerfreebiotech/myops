import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { sendProactiveMessages } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'

// 特殊假別資格申請（回報4）。
// POST：員工提出資格申請（限 requires_qualification 假別）＋多檔附件路徑。
// GET ?view=mine（預設）：本人申請清單；?view=review：HR 待審清單（排除自己）。

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { leave_type_id, reason, attachments } = await request.json()
  if (!leave_type_id || !reason || !String(reason).trim()) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  const paths = Array.isArray(attachments)
    ? attachments.filter((a: unknown): a is string => typeof a === 'string')
    : []

  // 僅特殊假別（requires_qualification）可走此流程
  const { data: leaveType } = await service
    .from('leave_types')
    .select('requires_qualification, name:name_zh')
    .eq('id', leave_type_id)
    .single()
  if (!leaveType?.requires_qualification) {
    return NextResponse.json({ error: t('leaveQualifications.notSpecialType') }, { status: 400 })
  }

  // owner RLS：user_id 必須為自己（createServiceClient 以使用者身分寫入）
  const { data, error } = await service.from('leave_qualification_requests').insert({
    user_id: user.id,
    leave_type_id,
    reason: String(reason).trim(),
    attachments: paths,
    status: 'pending',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // best-effort：通知 HR（admin 或 granted_features 含 hr_manager）有新特殊假資格申請待審；
  // 以各 HR 自己的語言發送，永不影響送出回應。
  try {
    const { data: applicant } = await service.from('users').select('display_name').eq('id', user.id).single()
    const { data: staff } = await service.from('users').select('id, language, role, granted_features').eq('is_active', true)
    const recipients = (staff ?? []).filter(s =>
      s.id !== user.id && (s.role === 'admin' || ((s.granted_features as string[] | null) ?? []).includes('hr_manager')))
    const msgs = recipients.map(s => ({
      userId: s.id,
      text: teamsText(s.language, 'leaveQualificationSubmitted', { name: applicant?.display_name ?? '', leaveType: leaveType?.name ?? '' }),
    }))
    if (msgs.length) await sendProactiveMessages(msgs)
  } catch (e) {
    console.error('[leave qualifications] HR notify failed:', e)
  }

  return NextResponse.json({ data })
}

export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const view = new URL(request.url).searchParams.get('view') ?? 'mine'

  if (view === 'review') {
    const { data: me } = await supabase.from('users').select('role, granted_features').eq('id', user.id).single()
    const isHR = me?.role === 'admin' || ((me?.granted_features as string[] | null) ?? []).includes('hr_manager')
    if (!isHR) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    const { data, error } = await service
      .from('leave_qualification_requests')
      .select('*, applicant:users!leave_qualification_requests_user_id_fkey(display_name), leave_type:leave_types(name:name_zh)')
      .eq('status', 'pending')
      .neq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  }

  // mine
  const { data, error } = await service
    .from('leave_qualification_requests')
    .select('*, leave_type:leave_types(name:name_zh)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
