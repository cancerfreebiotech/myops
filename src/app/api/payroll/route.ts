import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireFinance(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role, granted_features').eq('id', user.id).single()
  if (!['admin', 'hr'].includes(data?.role ?? '') && !data?.granted_features?.includes('view_payroll')) return null
  return user
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase.from('users').select('role, granted_features').eq('id', user.id).single()
  const isPrivileged = ['admin', 'hr'].includes(currentUser?.role ?? '') ||
    currentUser?.granted_features?.includes('view_payroll')

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') ?? String(new Date().getFullYear())
  const month = searchParams.get('month') ?? String(new Date().getMonth() + 1).padStart(2, '0')
  const target_user_id = searchParams.get('user_id')

  let query = service
    .from('payroll_records')
    .select(`*, user:users!payroll_records_user_id_fkey(id, display_name, department:departments(name))`)
    .eq('year', parseInt(year))
    .eq('month', parseInt(month))
    .order('created_at', { ascending: false })

  if (!isPrivileged) {
    query = query.eq('user_id', user.id)
  } else if (target_user_id) {
    query = query.eq('user_id', target_user_id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const user = await requireFinance(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { user_id, year, month, base_salary, overtime_pay, bonus, deductions, notes } = body

  if (!user_id || !year || !month || base_salary === undefined) {
    return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 })
  }

  const gross = (base_salary ?? 0) + (overtime_pay ?? 0) + (bonus ?? 0)
  const net = gross - (deductions ?? 0)

  const { data, error } = await service.from('payroll_records').upsert({
    user_id,
    year,
    month,
    base_salary,
    overtime_pay: overtime_pay ?? 0,
    bonus: bonus ?? 0,
    deductions: deductions ?? 0,
    gross_salary: gross,
    net_salary: net,
    notes: notes ?? null,
    status: 'draft',
    created_by: user.id,
  }, { onConflict: 'user_id,year,month' }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
