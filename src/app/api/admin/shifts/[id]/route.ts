import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireHR(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  if (data?.role !== 'admin' && data?.job_role !== 'hr_manager') return null
  return user
}

// 編輯班別
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const user = await requireHR(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json()
  const allowed = ['name', 'start_time', 'end_time', 'work_days', 'flex_minutes', 'break_minutes', 'is_active']
  const patch: Record<string, unknown> = {}
  for (const k of allowed) if (k in b) patch[k] = b[k]
  const { data, error } = await service.from('work_shifts').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

// 停用班別（軟刪除）
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const user = await requireHR(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await service.from('work_shifts')
    .update({ is_active: false, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { ok: true } })
}
