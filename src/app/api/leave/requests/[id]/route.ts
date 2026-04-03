import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check AAL2 for approvals
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: '需要完成雙重驗證才能審核請假', code: 'MFA_REQUIRED' }, { status: 403 })
  }

  const { action, reject_reason } = await request.json()

  const { data: leaveReq } = await service
    .from('leave_requests')
    .select('*, leave_type:leave_types(name)')
    .eq('id', id)
    .single()

  if (!leaveReq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
    if (leaveReq.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (leaveReq.status !== 'pending') return NextResponse.json({ error: '只能取消待審核的申請' }, { status: 400 })
    const { error } = await service.from('leave_requests').update({ status: 'cancelled' }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data: { ok: true } })
}
