import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // AAL2 required for approvals
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: '需要完成雙重驗證', code: 'MFA_REQUIRED' }, { status: 403 })
  }

  const { action, reject_reason } = await request.json()

  if (action === 'approve') {
    const { error } = await service.from('overtime_requests').update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  } else if (action === 'reject') {
    const { error } = await service.from('overtime_requests').update({
      status: 'rejected',
      reject_reason: reject_reason ?? null,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data: { ok: true } })
}
