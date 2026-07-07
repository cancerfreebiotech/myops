import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/** admin 閘門：非 admin 一律擋。回傳 { error } 代表已拒絕。 */
async function requireAdmin(): Promise<{ error?: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: cu } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (cu?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  const service = await createServiceClient()
  const { name, lat, lng, radius_m } = await request.json()
  if (!name || lat == null || lng == null || radius_m == null)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const { data, error } = await service.from('geofences')
    .insert({ name, lat, lng, radius_m })
    .select('id, name, lat, lng, radius_m, is_active')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  const service = await createServiceClient()
  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  for (const k of ['name', 'lat', 'lng', 'radius_m', 'is_active'] as const) {
    if (k in body) patch[k] = body[k]
  }
  const { error } = await service.from('geofences').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { ok: true } })
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  const service = await createServiceClient()
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await service.from('geofences').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { ok: true } })
}
