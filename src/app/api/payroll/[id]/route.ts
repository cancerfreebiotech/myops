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

  const { data: currentUser } = await supabase.from('users').select('role, job_role, granted_features').eq('id', user.id).single()
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
  const jobRole = currentUser?.job_role
  const features = currentUser?.granted_features ?? []

  if (action === 'hr_review' && !['admin', 'hr'].includes(role)) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }
  if (action === 'finance_confirm' && !features.includes('confirm_payroll') && role !== 'admin') {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }
  // 第三關 2026-07-30 起由人資長負責（原為營運長，Linda 回報 26011df2；Po 指定 Eva Hung）。
  // 內部狀態值仍是 coo_approved／coo_approved_by——改名要動 status CHECK 與兩個欄位，
  // 對進行中的資料沒有好處，因此只改權限與顯示文字。
  // job_role='hr_manager' 也放行，避免權限完全靠「她剛好是 admin」這件事。
  if (
    action === 'coo_approve' &&
    !features.includes('approve_payroll') &&
    jobRole !== 'hr_manager' &&
    role !== 'admin'
  ) {
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

  // 簽核軌跡：每個階段各自回填「誰、何時」（欄位由 20260729000012 migration 補齊；
  // 在此之前 paid_at 根本不存在，pay 這一步每次都被 PostgREST 以 PGRST204 擋掉）。
  const nowIso = new Date().toISOString()
  const auditByAction: Record<string, Record<string, string>> = {
    hr_review:       { hr_reviewed_by: user.id,       hr_reviewed_at: nowIso },
    finance_confirm: { finance_confirmed_by: user.id, finance_confirmed_at: nowIso },
    coo_approve:     { coo_approved_by: user.id,      coo_approved_at: nowIso },
    pay:             { paid_by: user.id,              paid_at: nowIso },
    reject:          { rejected_by: user.id,          rejected_at: nowIso },
  }
  const updatePayload: Record<string, string> = { status: newStatus, ...(auditByAction[action] ?? {}) }

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
