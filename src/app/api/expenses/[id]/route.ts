import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

async function isApprover(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('expense_approve')
}

// PATCH /api/expenses/[id]
//   審批者：{ action: 'approve' | 'reject' | 'pay', review_note? }（需 MFA aal2）
//   本人（pending）：{ action: 'cancel' }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const body = await request.json()
  const { action, review_note } = body

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('id, user_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!claim) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  if (action === 'cancel') {
    if (claim.user_id !== user.id) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (claim.status !== 'pending') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    const { data, error } = await supabase
      .from('expense_claims')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (!['approve', 'reject', 'pay'].includes(action)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  if (!(await isApprover(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  // 審批動作需要 MFA（同請假審批模式）
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
  }

  let updates: Record<string, unknown>
  if (action === 'approve') {
    if (claim.status !== 'pending') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    updates = { status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: review_note ?? null }
  } else if (action === 'reject') {
    if (claim.status !== 'pending') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    updates = { status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: review_note ?? null }
  } else {
    // pay：已核准的才能撥付
    if (claim.status !== 'approved') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    updates = { status: 'paid', paid_by: user.id, paid_at: new Date().toISOString() }
  }

  const { data, error } = await supabase
    .from('expense_claims')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/expenses/[id] — 本人刪除 pending 中的申請
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: deleted, error } = await supabase
    .from('expense_claims')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted?.length) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data: null })
}
