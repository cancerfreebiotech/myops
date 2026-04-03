import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireAccess(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  if (
    data?.role !== 'admin' &&
    !data?.granted_features?.includes('finance_payroll')
  ) return null
  return user
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const user = await requireAccess(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  const { data, error } = await service
    .from('bonus_records')
    .select(`
      *,
      user:users!bonus_records_user_id_fkey(id, display_name)
    `)
    .eq('year', year)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const user = await requireAccess(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { user_id, year, month, type, amount, description } = body

  if (!user_id || !year || !type || amount === undefined || amount === null) {
    return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 })
  }

  const validTypes = ['year_end', 'performance', 'project', 'other']
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: '無效的獎金類型' }, { status: 400 })
  }

  const { data, error } = await service
    .from('bonus_records')
    .insert({
      user_id,
      year: parseInt(year),
      month: month ? parseInt(month) : null,
      type,
      amount: parseFloat(amount),
      description: description ?? null,
      created_by: user.id,
    })
    .select(`
      *,
      user:users!bonus_records_user_id_fkey(id, display_name)
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
