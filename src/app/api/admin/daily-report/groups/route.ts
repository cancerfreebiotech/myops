import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/admin/daily-report/groups
export async function GET() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await service.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: groups, error } = await service
    .from('daily_report_groups')
    .select(`
      *,
      members:daily_report_group_members(
        user_id, role,
        user:users(id, display_name, email)
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: groups ?? [] })
}

// POST /api/admin/daily-report/groups  { name, description, members: [{user_id, role}] }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await service.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { name, description, members } = body

  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  const { data: group, error: groupErr } = await service
    .from('daily_report_groups')
    .insert({ name, description: description ?? null, created_by: user.id })
    .select()
    .single()

  if (groupErr || !group) return NextResponse.json({ error: groupErr?.message ?? 'Failed' }, { status: 500 })

  if (Array.isArray(members) && members.length) {
    const { error: memberErr } = await service.from('daily_report_group_members').insert(
      members.map((m: { user_id: string; role: string }) => ({
        group_id: group.id,
        user_id: m.user_id,
        role: m.role ?? 'member',
      }))
    )
    // Compensating rollback: drop the just-created group so no half-built group lingers.
    if (memberErr) {
      await service.from('daily_report_groups').delete().eq('id', group.id)
      return NextResponse.json({ error: memberErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ data: group })
}
