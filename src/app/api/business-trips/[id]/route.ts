import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// PATCH /api/business-trips/[id]  { action: 'approve' | 'reject' | 'cancel', reject_reason? }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { action, reject_reason } = await request.json()

  const { data: trip } = await supabase
    .from('business_trips')
    .select('id, user_id, approver_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!trip) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  if (action === 'cancel') {
    if (trip.user_id !== user.id) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (trip.status !== 'pending') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    const { data, error } = await supabase
      .from('business_trips')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  if (trip.status !== 'pending') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  // 審批人限本人主管 / hr_manager / admin
  const { data: me } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  // 職責分離：不得核准自己的出差單（與請假/加班一致）
  if (trip.user_id === user.id) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  const canApprove = me?.role === 'admin'
    || (me?.granted_features as string[] | null)?.includes('hr_manager')
    || trip.approver_id === user.id
  if (!canApprove) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  // 審批動作需要 MFA（同請假/加班）
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
  }

  const updates = action === 'approve'
    ? { status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() }
    : { status: 'rejected', approved_by: user.id, approved_at: new Date().toISOString(), reject_reason: reject_reason ?? null }

  // compare-and-swap：只在仍為 pending 時轉換，擋並發/重複核准（避免重複推 Outlook）
  const { data, error } = await supabase
    .from('business_trips')
    .update(updates)
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: t('common.forbidden'), code: 'ALREADY_PROCESSED' }, { status: 409 })

  // 單向同步：核准 → 在申請人 Outlook 建立出差事件；退回 → 清除既有事件（best-effort）
  if (action === 'approve') {
    try {
      const { pushOutlookEvent } = await import('@/lib/ms-calendar')
      const eventId = await pushOutlookEvent(data.user_id, {
        subject: `出差（${data.destination}）`, startDate: data.start_date, endDate: data.end_date,
      })
      if (eventId) await supabase.from('business_trips').update({ outlook_event_id: eventId }).eq('id', id)
    } catch (e) {
      console.error('[business-trip] Outlook push failed:', e)
    }
  } else if (action === 'reject' && data.outlook_event_id) {
    try {
      const { deleteOutlookEvent } = await import('@/lib/ms-calendar')
      await deleteOutlookEvent(data.user_id, data.outlook_event_id)
    } catch (e) {
      console.error('[business-trip] Outlook delete failed:', e)
    }
  }

  return NextResponse.json({ data })
}
