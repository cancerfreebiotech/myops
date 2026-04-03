import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase.from('users').select('role, granted_features').eq('id', user.id).single()
  const canPublish = currentUser?.role === 'admin' || currentUser?.granted_features?.includes('publish_announcement')
  if (!canPublish) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { recipient_user_ids, requires_confirmation, reminder_days } = await request.json()

  // Approve the document
  const { error: updateError } = await service.from('documents').update({
    status: 'approved',
    approved_by: user.id,
    approved_at: new Date().toISOString(),
  }).eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  // Create recipient records
  if (recipient_user_ids?.length) {
    const inserts = recipient_user_ids.map((uid: string) => ({
      document_id: id,
      user_id: uid,
      requires_confirmation: requires_confirmation ?? true,
      reminder_days: reminder_days ?? 3,
    }))
    const { error: recipientsError } = await service.from('document_recipients').insert(inserts)
    if (recipientsError) return NextResponse.json({ error: recipientsError.message }, { status: 400 })
  }

  await service.from('audit_logs').insert({
    doc_id: id,
    user_id: user.id,
    action: 'publish',
    detail: { recipient_count: recipient_user_ids?.length ?? 0 },
  })

  return NextResponse.json({ data: { ok: true } })
}
