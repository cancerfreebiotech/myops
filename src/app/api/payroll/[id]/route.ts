import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  // AAL2 required for approval actions
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
  }

  const { data: currentUser } = await supabase.from('users').select('role, granted_features').eq('id', user.id).single()
  const body = await request.json()
  const { action } = body

  const statusMap: Record<string, string> = {
    hr_review: 'hr_reviewed',
    finance_confirm: 'finance_confirmed',
    coo_approve: 'coo_approved',
    pay: 'paid',
    reject: 'rejected',
  }

  // 狀態機前置條件：強制 draft → hr_reviewed → finance_confirmed → coo_approved → paid，
  // 避免跳階或倒退；reject 允許在任一「尚未付款」階段執行。
  const allowedFromStatus: Record<string, string[]> = {
    hr_review: ['draft'],
    finance_confirm: ['hr_reviewed'],
    coo_approve: ['finance_confirmed'],
    pay: ['coo_approved'],
    reject: ['draft', 'hr_reviewed', 'finance_confirmed', 'coo_approved'],
  }

  const newStatus = statusMap[action]
  if (!newStatus) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  // Role checks
  const role = currentUser?.role
  const features = currentUser?.granted_features ?? []

  if (action === 'hr_review' && !['admin', 'hr'].includes(role)) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }
  if (action === 'finance_confirm' && !features.includes('confirm_payroll') && role !== 'admin') {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }
  if (action === 'coo_approve' && !features.includes('approve_payroll') && role !== 'admin') {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }
  if (action === 'pay' && role !== 'admin') {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  // 讀取現況並驗證目前 status 是否為此 action 的合法前置狀態
  const allowedPrev = allowedFromStatus[action] ?? []
  const { data: existing, error: fetchError } = await service
    .from('payroll_records')
    .select('status')
    .eq('id', id)
    .single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  }
  if (!allowedPrev.includes(existing.status)) {
    return NextResponse.json(
      { error: t('common.invalidRequest'), code: 'INVALID_STATE', currentStatus: existing.status },
      { status: 409 },
    )
  }

  const updatePayload: { status: string; paid_at?: string } = { status: newStatus }
  if (action === 'pay') updatePayload.paid_at = new Date().toISOString()

  // .in('status', allowedPrev)：DB 層條件式寫入，關閉 TOCTOU 競態（被搶改則 0 列，.single() 報錯）
  const { data, error } = await service
    .from('payroll_records')
    .update(updatePayload)
    .eq('id', id)
    .in('status', allowedPrev)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
