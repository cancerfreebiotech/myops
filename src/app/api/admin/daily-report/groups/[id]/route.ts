import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, service: Awaited<ReturnType<typeof createServiceClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: userRow } = await service.from('users').select('role').eq('id', user.id).single()
  return userRow?.role === 'admin' ? user : null
}

// PATCH /api/admin/daily-report/groups/[id]  { name?, description?, members? }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const user = await requireAdmin(supabase, service)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { name, description, members } = body

  const updates: Record<string, string | null> = {}
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description

  if (Object.keys(updates).length) {
    const { error } = await service.from('daily_report_groups').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Replace members if provided — atomic delete+insert in one transaction (RLS via is_admin()).
  if (Array.isArray(members)) {
    const { error } = await service.rpc('dr_replace_group_members', {
      p_group_id: id,
      p_members: members,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { id } })
}

// DELETE /api/admin/daily-report/groups/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const user = await requireAdmin(supabase, service)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { error } = await service
    .from('daily_report_groups')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: null })
}
