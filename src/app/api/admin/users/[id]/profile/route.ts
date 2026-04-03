import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// T62: User profile API (admin access)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: targetUser } = await service
    .from('users')
    .select('id, display_name, email, employment_type, department:departments(name)')
    .eq('id', userId)
    .single()

  const { data: profile } = await service
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  return NextResponse.json({
    data: {
      user: targetUser,
      profile: profile ?? null,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const allowedFields = [
    'hire_date', 'termination_date', 'id_number', 'birth_date',
    'phone', 'address', 'emergency_contact', 'emergency_phone',
    'bank_code', 'bank_account', 'labor_pension_self',
    'monthly_salary', 'hourly_rate',
  ]

  const updates: Record<string, any> = { updated_by: user.id }
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key] === '' ? null : body[key]
    }
  }

  const { data, error } = await service
    .from('user_profiles')
    .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
