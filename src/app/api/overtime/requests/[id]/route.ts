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

  // AAL2 required for approvals
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
  }

  const { action, reject_reason } = await request.json()

  // 核准/退回：驗證核准人身分（主管／專案負責人／coo／admin），且不得核准自己的單
  if (action === 'approve' || action === 'reject') {
    const { data: otReq } = await service
      .from('overtime_requests')
      .select('user_id, status, project_id')
      .eq('id', id)
      .single()
    if (!otReq) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
    if (otReq.status !== 'pending') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

    const { data: me } = await service
      .from('users')
      .select('role, granted_features')
      .eq('id', user.id)
      .single()
    const isAdmin = me?.role === 'admin'
    const hasCoo = (me?.granted_features as string[] | null)?.includes('coo_notify')
    const { data: applicant } = await service
      .from('users').select('manager_id').eq('id', otReq.user_id).single()
    const isManager = applicant?.manager_id === user.id
    let isProjectLead = false
    if (otReq.project_id) {
      const { data: proj } = await service
        .from('projects').select('project_lead_id').eq('id', otReq.project_id).single()
      isProjectLead = proj?.project_lead_id === user.id
    }
    if (otReq.user_id === user.id || !(isAdmin || hasCoo || isManager || isProjectLead)) {
      return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    }
  }

  if (action === 'approve') {
    // Compare-and-swap on status='pending' so two concurrent approvers can't
    // both flip the same request (double approval). Zero affected rows ⇒ the
    // request was already approved/rejected by a racing request.
    const { data: updated, error } = await service.from('overtime_requests').update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'pending').select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!updated || updated.length === 0) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  } else if (action === 'reject') {
    const { data: updated, error } = await service.from('overtime_requests').update({
      status: 'rejected',
      reject_reason: reject_reason ?? null,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'pending').select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!updated || updated.length === 0) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  return NextResponse.json({ data: { ok: true } })
}
