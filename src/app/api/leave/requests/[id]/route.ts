import { createClient, createServiceClient } from '@/lib/supabase/server'
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
    const { error } = await service.from('leave_requests').update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Deduct leave balance
    const currentYear = new Date(leaveReq.start_date).getFullYear()
    const { data: balance } = await service
      .from('leave_balances')
      .select('id, used_days, remaining_days')
      .eq('user_id', leaveReq.user_id)
      .eq('leave_type_id', leaveReq.leave_type_id)
      .eq('year', currentYear)
      .single()

    if (balance) {
      await service.from('leave_balances').update({
        used_days: balance.used_days + leaveReq.total_days,
        remaining_days: Math.max(0, balance.remaining_days - leaveReq.total_days),
      }).eq('id', balance.id)
    }

  } else if (action === 'reject') {
    const { error } = await service.from('leave_requests').update({
      status: 'rejected',
      reject_reason: reject_reason ?? null,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

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
