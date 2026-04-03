import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, department_id')
    .eq('id', user.id)
    .single()

  const { searchParams } = new URL(request.url)
  const target_user_id = searchParams.get('user_id')
  const year = searchParams.get('year') ?? new Date().getFullYear().toString()
  const month = searchParams.get('month') ?? String(new Date().getMonth() + 1).padStart(2, '0')
  const department_id = searchParams.get('department_id')

  const startDate = `${year}-${month.padStart(2, '0')}-01`
  const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'hr'

  // Self or admin
  let query = service
    .from('attendance_records')
    .select(`*, user:users!attendance_records_user_id_fkey(id, display_name, employment_type, department_id)`)
    .gte('clock_date', startDate)
    .lte('clock_date', endDate)
    .order('clock_date', { ascending: false })

  if (!isAdmin) {
    query = query.eq('user_id', user.id)
  } else if (target_user_id) {
    query = query.eq('user_id', target_user_id)
  } else if (department_id) {
    query = query.eq('user.department_id', department_id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
