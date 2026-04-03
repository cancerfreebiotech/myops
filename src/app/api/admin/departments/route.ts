import { createServiceClient, createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = await createServiceClient()
  const { data } = await service.from('users').select('role').eq('id', user.id).single()
  return data?.role === 'admin' ? service : null
}

export async function POST(request: NextRequest) {
  const service = await requireAdmin()
  if (!service) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, code } = await request.json()
  const { error } = await service.from('departments').insert({ name, code })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: 'ok' })
}
