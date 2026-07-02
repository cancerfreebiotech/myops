import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isValidDateString } from '@/lib/taipei-date'

// GET /api/daily-report/kpi?date=YYYY-MM-DD&userId=xxx
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const userId = searchParams.get('userId') ?? user.id

  if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 })

  const { data, error } = await supabase
    .from('dr_kpi_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/daily-report/kpi  { date, kpi_def_id, value }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { date, kpi_def_id, value } = body

  if (!isValidDateString(date)) {
    return NextResponse.json({ error: 'Invalid date format (YYYY-MM-DD)' }, { status: 400 })
  }

  if (!date || !kpi_def_id || value === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('dr_kpi_entries')
    .upsert(
      { user_id: user.id, date, kpi_def_id, value },
      { onConflict: 'user_id,date,kpi_def_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
