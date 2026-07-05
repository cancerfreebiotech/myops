import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// 可透過本路由更新的欄位（審核狀態流轉）；其餘欄位一律拒絕
const ALLOWED_FIELDS = ['status', 'reject_reason', 'approved_at', 'approved_by', 'folder']

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 審核動作限 admin 或具 approve_contract 權限者
  const { data: currentUser } = await service
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const canApprove = currentUser?.role === 'admin'
    || (currentUser?.granted_features as string[] | null)?.includes('approve_contract')
  if (!canApprove) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 審核動作需 MFA（aal2），與請假/加班/報帳/出差/採購一致
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'MFA required', code: 'MFA_REQUIRED' }, { status: 403 })
  }

  const body = await request.json()
  const action = body._action as string | undefined
  delete body._action

  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED_FIELDS.includes(k)))
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No permitted fields' }, { status: 400 })
  }

  const { data, error } = await service.from('documents').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (action) {
    await service.from('audit_logs').insert({
      doc_id: id, user_id: user.id, action,
      detail: action === 'reject' ? { reason: body.reject_reason } : null,
    })
  }

  return NextResponse.json({ data })
}
