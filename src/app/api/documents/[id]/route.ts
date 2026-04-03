import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const action = body._action as string | undefined
  delete body._action

  const { data, error } = await service.from('documents').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (action) {
    await service.from('audit_logs').insert({
      doc_id: id, user_id: user.id, action,
      detail: action === 'reject' ? { reason: body.reject_reason } : null,
    })
  }

  return NextResponse.json({ data })
}
