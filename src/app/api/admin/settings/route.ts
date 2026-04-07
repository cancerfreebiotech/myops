import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { KEY_OWNER } from '@/lib/role-settings'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, job_role')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const jobRole: string = currentUser?.job_role ?? 'member'

  const { key, value } = await request.json()
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })

  // Admin can edit everything; job_role users can only edit keys they own
  if (!isAdmin) {
    const owner = KEY_OWNER[key]
    if (!owner || jobRole !== owner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { error } = await service.from('system_settings')
    .upsert({ key, value }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { ok: true } })
}
