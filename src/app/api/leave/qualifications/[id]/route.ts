import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { sendProactiveMessage } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'

// HR 審核特殊假別資格申請（回報4）。核准→原子寫入 leave_balances（既有送單阻擋自動解鎖）。
// house pattern：AAL2 MFA 重檢、HR 授權、職責分離＋compare-and-swap 於 SECURITY DEFINER RPC 內。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  // 簽核需 AAL2
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
  }

  // HR 授權（與請假模組一致：admin 或 granted_features 含 hr_manager）
  const { data: me } = await supabase.from('users').select('role, granted_features').eq('id', user.id).single()
  const isHR = me?.role === 'admin' || ((me?.granted_features as string[] | null) ?? []).includes('hr_manager')
  if (!isHR) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { action, granted_days, hr_note, year } = await request.json()
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }
  if (action === 'approve' && !(Number(granted_days) > 0)) {
    return NextResponse.json({ error: t('leaveQualifications.invalidGrantDays') }, { status: 400 })
  }

  // 原子核准＋核給（職責分離、compare-and-swap 於 RPC 內把關）
  const { data, error } = await service.rpc('approve_leave_qualification', {
    p_id: id,
    p_approve: action === 'approve',
    p_granted_days: action === 'approve' ? Number(granted_days) : null,
    p_hr_note: hr_note ? String(hr_note) : null,
    p_year: Number.isInteger(year) ? year : null,
  })
  if (error) {
    const m = error.message || ''
    if (m.includes('not_found')) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
    if (m.includes('invalid_grant_days')) return NextResponse.json({ error: t('leaveQualifications.invalidGrantDays') }, { status: 400 })
    if (m.includes('already_processed')) return NextResponse.json({ error: t('leaveQualifications.alreadyProcessed'), code: 'ALREADY_PROCESSED' }, { status: 409 })
    if (m.includes('forbidden')) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    console.error('[leave qualifications] rpc failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  // best-effort：以申請人語言通知審核結果（永不影響回應）
  try {
    const row = Array.isArray(data) ? data[0] : data
    if (row?.user_id) {
      const { data: applicant } = await service.from('users').select('language').eq('id', row.user_id).single()
      const { data: lt } = await service.from('leave_types').select('name:name_zh').eq('id', row.leave_type_id).single()
      const ltName = lt?.name ?? ''
      const text = action === 'approve'
        ? teamsText(applicant?.language, 'leaveQualificationApproved', { leaveType: ltName, days: row.granted_days ?? 0 })
        : teamsText(applicant?.language, 'leaveQualificationRejected', { leaveType: ltName, reason: (hr_note ? String(hr_note) : '') || '-' })
      await sendProactiveMessage(row.user_id, text)
    }
  } catch (e) {
    console.error('[leave qualifications] applicant notify failed:', e)
  }

  return NextResponse.json({ data })
}
