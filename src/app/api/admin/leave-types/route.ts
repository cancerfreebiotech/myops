import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireHR(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'hr'].includes(data?.role ?? '')) return null
  return user
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const user = await requireHR(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { data, error } = await service.from('leave_types').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
