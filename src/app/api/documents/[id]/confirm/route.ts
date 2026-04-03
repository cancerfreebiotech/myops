import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check AAL2 (2FA confirmed)
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: '需要完成雙重驗證才能確認公告', code: 'MFA_REQUIRED' }, { status: 403 })
  }

  const { error } = await service.from('document_recipients').update({
    confirmed_at: new Date().toISOString(),
  }).eq('document_id', id).eq('user_id', user.id).is('confirmed_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await service.from('audit_logs').insert({
    doc_id: id,
    user_id: user.id,
    action: 'confirm',
    detail: null,
  })

  return NextResponse.json({ data: { ok: true } })
}
