import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { sendProactiveMessage } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'
import { pickBalanceForDate } from '@/lib/leave-balance'

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

  const { action, reject_reason, cancel_reason } = await request.json()

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
    // 依請假 start_date 解析餘額歸屬：特休週年制落在對應 period，其餘假別以曆年 fallback。
    const { data: balanceRows } = await admin
      .from('leave_balances')
      .select('id, used_days, total_days, period_start, period_end, year')
      .eq('user_id', leaveReq.user_id)
      .eq('leave_type_id', leaveReq.leave_type_id)
    const balance = pickBalanceForDate(balanceRows ?? [], leaveReq.start_date)

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

    // Deduct leave balance — 原子扣減（deduct_leave_balance RPC）取代舊的 read-then-write，
    // 修同一餘額列並發核准的超扣 race（CAS 原本只守在 request.status，未守餘額列）。
    // 扣減失敗（不存在／並發後會超額）→ 回捲剛核准的請假單為 pending，再回報錯誤。
    if (balance) {
      const { data: dedData, error: dedErr } = await admin.rpc('deduct_leave_balance', {
        p_balance_id: balance.id,
        p_days: Number(leaveReq.total_days),
      })
      const dedResult = Array.isArray(dedData) ? dedData[0] : dedData
      if (dedErr || !dedResult?.ok) {
        // 回捲核准（僅在仍為我方剛設的 approved 時），維持餘額與單據一致
        await service.from('leave_requests').update({
          status: 'pending', approved_by: null, approved_at: null,
        }).eq('id', id).eq('status', 'approved')
        if (dedErr) {
          console.error('[leave] atomic balance deduction failed:', dedErr, 'balanceId:', balance.id)
          return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
        }
        const lt = Array.isArray(leaveReq.leave_type) ? leaveReq.leave_type[0] : leaveReq.leave_type
        return NextResponse.json({
          error: t('leaveRequests.insufficientBalance', { name: lt?.name ?? '', remaining: dedResult?.remaining ?? 0 }),
        }, { status: 400 })
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
    // cancel 同時涵蓋兩種語意：取消「待審」與撤銷「已核准」。
    // 待審＝只有申請人本人；已核准＝申請人本人或 HR/admin（主管代撤的情境走 HR/admin），
    // 因為撤銷已核准要退還額度、並刪除已推送的 Outlook 事件，屬敏感操作故留稽核欄位。
    const prevStatus = leaveReq.status as string
    let revokedByOther = false
    if (prevStatus === 'pending') {
      if (leaveReq.user_id !== user.id) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    } else if (prevStatus === 'approved') {
      if (leaveReq.user_id !== user.id) {
        const { data: me } = await service
          .from('users')
          .select('role, granted_features')
          .eq('id', user.id)
          .single()
        const isHrOrAdmin = me?.role === 'admin'
          || (me?.granted_features as string[] | null)?.includes('hr_manager')
        if (!isHrOrAdmin) return NextResponse.json({ error: t('leaveRequests.revokeForbidden') }, { status: 403 })
        revokedByOther = true
      }
    } else {
      // rejected / cancelled 已是終態，沒有可撤銷的東西
      return NextResponse.json({ error: t('leaveRequests.cannotCancel') }, { status: 400 })
    }

    // compare-and-swap：只在狀態仍為讀取時的原狀態才改，擋並發（例如主管正在核准同一張單、
    // 或使用者重複點擊造成重複退還額度）
    const { data: cancelled, error } = await service.from('leave_requests').update({
      status: 'cancelled',
      cancelled_by: user.id,
      cancelled_at: new Date().toISOString(),
      cancel_reason: cancel_reason ?? null,
    }).eq('id', id).eq('status', prevStatus).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!cancelled || cancelled.length === 0) {
      return NextResponse.json({ error: t('common.forbidden'), code: 'ALREADY_PROCESSED' }, { status: 409 })
    }

    // 退還額度：只有原狀態 approved 才扣過額度。用 createAdminClient（真正繞 RLS，
    // leave_balances 的 RLS 只允許 self/hr_manager/admin，HR 以外的撤銷者讀不到），
    // 並沿用 approve 分支同一套 pickBalanceForDate — 扣哪一列就還哪一列。
    if (prevStatus === 'approved') {
      const admin = createAdminClient()
      const { data: balanceRows } = await admin
        .from('leave_balances')
        .select('id, used_days, total_days, period_start, period_end, year')
        .eq('user_id', leaveReq.user_id)
        .eq('leave_type_id', leaveReq.leave_type_id)
      const balance = pickBalanceForDate(balanceRows ?? [], leaveReq.start_date)

      // 無 balance 列＝該假別不受額度控管（核准時也沒扣），無需退還
      if (balance) {
        const { data: resData, error: resErr } = await admin.rpc('restore_leave_balance', {
          p_balance_id: balance.id,
          p_days: Number(leaveReq.total_days),
        })
        const resResult = Array.isArray(resData) ? resData[0] : resData
        if (resErr || !resResult?.ok) {
          // 額度與單據必須一致：退還失敗就回捲成 approved（僅在仍為我方剛設的 cancelled 時），
          // 讓使用者重試，而不是留下「已撤銷但額度沒還」的破洞。
          // 回捲必須用 admin（真正繞 RLS）：leave_requests 的 UPDATE policy WITH CHECK 只允許
          // 本人把自己的單留在 pending/cancelled，一般員工自撤時用 service 寫回 approved 會被
          // RLS 擋掉（42501），回捲失敗＝單子停在 cancelled 但額度沒退，正是這段要防的破洞。
          const { error: rollbackErr } = await admin.from('leave_requests').update({
            status: 'approved', cancelled_by: null, cancelled_at: null, cancel_reason: null,
          }).eq('id', id).eq('status', 'cancelled')
          if (rollbackErr) console.error('[leave] revoke rollback failed (額度與單據可能不一致):', rollbackErr)
          console.error('[leave] atomic balance restore failed:', resErr, 'balanceId:', balance.id)
          return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
        }
        // clamped＝退還前的 used_days 就已少於要退還的天數（額度資料在此之前已不一致）。
        // RPC 夾住下界讓撤銷照樣成功，但這裡必須留下紀錄，否則異常會被靜默吃掉。
        if (resResult?.clamped) {
          console.warn(
            '[leave] balance restore clamped at 0 — used_days 原本就少於退還天數，額度資料疑似不一致.',
            'balanceId:', balance.id, 'requestId:', id, 'days:', Number(leaveReq.total_days)
          )
        }
      }
    }

    // 清除核准時推送的 Outlook 事件（best-effort，永不影響撤銷回應）
    if (leaveReq.outlook_event_id) {
      try {
        const { deleteOutlookEvent } = await import('@/lib/ms-calendar')
        await deleteOutlookEvent(leaveReq.user_id, leaveReq.outlook_event_id)
        await service.from('leave_requests').update({ outlook_event_id: null }).eq('id', id)
      } catch (e) { console.error('[leave] Outlook delete failed:', e) }
    }

    // 通知申請人（best-effort）：只有「被別人撤銷」才通知 —— 自己撤銷自己的單不需要
    // 反過來通知自己（teamsMessages.leaveRevoked 因此保留未用，供未來代撤情境擴充）
    if (revokedByOther) {
      try {
        const { data: applicant } = await service
          .from('users')
          .select('language')
          .eq('id', leaveReq.user_id)
          .single()
        const date = leaveReq.start_date === leaveReq.end_date
          ? leaveReq.start_date
          : `${leaveReq.start_date} ~ ${leaveReq.end_date}`
        await sendProactiveMessage(leaveReq.user_id, teamsText(applicant?.language, 'leaveRevokedByHr', { date }))
      } catch (e) {
        console.error('[leave] Teams notify failed:', e)
      }
    }
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
