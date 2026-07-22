import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// PATCH /api/attendance/makeup/[id]  { action: 'approve' | 'reject', reject_reason? }
// 授權（approver 本人或 admin）與寫入 attendance_records 由
// approve_makeup_request() SECURITY DEFINER function 原子化處理
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { action, reject_reason } = await request.json()
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  // 審批動作需要 MFA（同請假/加班）
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
  }

  const { data, error } = await supabase.rpc('approve_makeup_request', {
    p_request_id: id,
    p_approve: action === 'approve',
    p_reject_reason: reject_reason ?? null,
  })

  if (error) {
    const isMfa = error.message.includes('mfa_required')
    if (error.message.includes('voided_requires_hr')) {
      return NextResponse.json({ error: t('attendanceClock.makeupVoidedRequiresHr') }, { status: 403 })
    }
    const status = isMfa ? 403
      : error.message.includes('forbidden') ? 403
      : error.message.includes('not_found') ? 404
      : error.message.includes('already_processed') ? 409 : 500
    return NextResponse.json({ error: error.message, ...(isMfa ? { code: 'MFA_REQUIRED' } : {}) }, { status })
  }
  return NextResponse.json({ data })
}
