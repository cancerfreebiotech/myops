import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { sendProactiveMessage } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  // Check AAL2 for approvals
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
  }

  const { action, reject_reason } = await request.json()

  const { data: leaveReq } = await service
    .from('leave_requests')
    .select('*, leave_type:leave_types(name:name_zh)')
    .eq('id', id)
    .single()

  if (!leaveReq) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  // 核准/退回限 直屬主管 / hr_manager / admin，且不得核准自己的單（職責分離）
  if (action === 'approve' || action === 'reject') {
    const { data: me } = await service
      .from('users')
      .select('role, granted_features')
      .eq('id', user.id)
      .single()
    const isHrOrAdmin = me?.role === 'admin'
      || (me?.granted_features as string[] | null)?.includes('hr_manager')
    const { data: applicant } = await service
      .from('users')
      .select('manager_id')
      .eq('id', leaveReq.user_id)
      .single()
    const isManager = applicant?.manager_id === user.id
    if (leaveReq.user_id === user.id || !(isHrOrAdmin || isManager)) {
      return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    }
    if (leaveReq.status !== 'pending') {
      return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    }
  }

  if (action === 'approve') {
    // 核准前先驗餘額（leave_balances 無 remaining_days，以 total_days - used_days 判斷）；
    // 有 balance 記錄即代表該假別受額度控管，核准後 used_days 不得超過 total_days。
    // 餘額讀取/扣除改用真 service（createAdminClient，繞過 RLS）：leave_balances 的 RLS
    // 只允許 self/hr_manager/admin 讀寫，一般直屬主管核准時用 createServiceClient 會讀到 null、
    // 扣除被靜默擋掉（授權檢查已於上方完成）。
    const admin = createAdminClient()
    const currentYear = Number(String(leaveReq.start_date).slice(0, 4))
    const { data: balance } = await admin
      .from('leave_balances')
      .select('id, used_days, total_days')
      .eq('user_id', leaveReq.user_id)
      .eq('leave_type_id', leaveReq.leave_type_id)
      .eq('year', currentYear)
      .single()

    if (balance) {
      const remaining = Number(balance.total_days) - Number(balance.used_days ?? 0)
      if (Number(leaveReq.total_days) > remaining) {
        const lt = Array.isArray(leaveReq.leave_type) ? leaveReq.leave_type[0] : leaveReq.leave_type
        return NextResponse.json({ error: t('leaveRequests.insufficientBalance', { name: lt?.name ?? '', remaining }) }, { status: 400 })
      }
    }

    // compare-and-swap：只在仍為 pending 時核准，擋並發/重複核准（避免重複扣假與重複推 Outlook）
    const { data: approved, error } = await service.from('leave_requests').update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'pending').select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!approved || approved.length === 0) {
      return NextResponse.json({ error: t('common.forbidden'), code: 'ALREADY_PROCESSED' }, { status: 409 })
    }

    // Deduct leave balance（leave_balances 無 remaining_days，只累加 used_days）；
    // 以 admin client 扣除並檢查 affected rows，確保未被 RLS 靜默擋下（命中 0 列即報錯）。
    if (balance) {
      const { data: deducted, error: dedErr } = await admin.from('leave_balances').update({
        used_days: Number(balance.used_days ?? 0) + Number(leaveReq.total_days),
      }).eq('id', balance.id).select('id')
      if (dedErr || !deducted || deducted.length === 0) {
        console.error('[leave] balance deduction failed:', dedErr, 'balanceId:', balance.id)
        return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
      }
    }

    // 單向同步：在申請人 Outlook 建立請假事件（best-effort，永不影響核准回應）
    try {
      const { pushOutlookEvent } = await import('@/lib/ms-calendar')
      const lt = Array.isArray(leaveReq.leave_type) ? leaveReq.leave_type[0] : leaveReq.leave_type
      const subject = `請假${lt?.name ? `（${lt.name}）` : ''}`
      const eventId = await pushOutlookEvent(leaveReq.user_id, {
        subject, startDate: leaveReq.start_date, endDate: leaveReq.end_date,
      })
      if (eventId) await service.from('leave_requests').update({ outlook_event_id: eventId }).eq('id', id)
    } catch (e) {
      console.error('[leave] Outlook push failed:', e)
    }

  } else if (action === 'reject') {
    const { error } = await service.from('leave_requests').update({
      status: 'rejected',
      reject_reason: reject_reason ?? null,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // 若先前已同步過（理論上 reject 前為 pending 不會有），仍嘗試清除 Outlook 事件
    if (leaveReq.outlook_event_id) {
      try {
        const { deleteOutlookEvent } = await import('@/lib/ms-calendar')
        await deleteOutlookEvent(leaveReq.user_id, leaveReq.outlook_event_id)
      } catch (e) { console.error('[leave] Outlook delete failed:', e) }
    }

  } else if (action === 'cancel') {
    // Only requestor can cancel
    if (leaveReq.user_id !== user.id) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (leaveReq.status !== 'pending') return NextResponse.json({ error: t('leaveRequestItem.onlyPendingCancellable') }, { status: 400 })
    const { error } = await service.from('leave_requests').update({ status: 'cancelled' }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Notify applicant via Teams (fire-and-forget: never fail the approval response)
  if (action === 'approve' || action === 'reject') {
    try {
      const { data: applicant } = await service
        .from('users')
        .select('language')
        .eq('id', leaveReq.user_id)
        .single()
      // teamsText builds the message in the APPLICANT's language — getTranslations({ locale })
      // is ignored by src/i18n/request.ts and would use the approver's cookie locale.
      const date = leaveReq.start_date === leaveReq.end_date
        ? leaveReq.start_date
        : `${leaveReq.start_date} ~ ${leaveReq.end_date}`
      const text = action === 'approve'
        ? teamsText(applicant?.language, 'leaveApproved', { date })
        : teamsText(applicant?.language, 'leaveRejected', { date, reason: reject_reason ?? '-' })
      await sendProactiveMessage(leaveReq.user_id, text)
    } catch (e) {
      console.error('[leave] Teams notify failed:', e)
    }
  }

  return NextResponse.json({ data: { ok: true } })
}
