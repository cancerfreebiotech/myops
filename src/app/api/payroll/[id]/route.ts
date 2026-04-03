import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // AAL2 required for approval actions
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: '需要完成雙重驗證', code: 'MFA_REQUIRED' }, { status: 403 })
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

  const newStatus = statusMap[action]
  if (!newStatus) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  // Role checks
  const role = currentUser?.role
  const features = currentUser?.granted_features ?? []

  if (action === 'hr_review' && !['admin', 'hr'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (action === 'finance_confirm' && !features.includes('confirm_payroll') && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (action === 'coo_approve' && !features.includes('approve_payroll') && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (action === 'pay' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updatePayload: any = { status: newStatus }
  if (action === 'pay') updatePayload.paid_at = new Date().toISOString()

  const { data, error } = await service.from('payroll_records').update(updatePayload).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
