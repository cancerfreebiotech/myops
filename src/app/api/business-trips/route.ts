import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isValidDateString } from '@/lib/taipei-date'

// GET /api/business-trips?view=mine|approve|all — 出差申請
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') ?? 'mine'

  const { data: me } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const isAdminOrHR = me?.role === 'admin' || (me?.granted_features as string[] | null)?.includes('hr_manager')

  let query = supabase
    .from('business_trips')
    .select('*, user:users!business_trips_user_id_fkey(id, display_name), approver:users!business_trips_approved_by_fkey(display_name)')
    .order('start_date', { ascending: false })

  if (view === 'mine') {
    query = query.eq('user_id', user.id)
  } else if (view === 'approve') {
    query = query.eq('status', 'pending')
    if (!isAdminOrHR) query = query.eq('approver_id', user.id)
  } else if (!isAdminOrHR) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/business-trips { destination, purpose, start_date, end_date, itinerary }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const body = await request.json()
  const { destination, purpose, start_date, end_date, itinerary } = body

  if (!destination?.trim() || !purpose?.trim()
    || !isValidDateString(start_date) || !isValidDateString(end_date) || end_date < start_date) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  // 同請假模式：送出時指定主管為審批人
  const { data: userRecord } = await service
    .from('users')
    .select('manager_id')
    .eq('id', user.id)
    .single()

  const { data, error } = await supabase
    .from('business_trips')
    .insert({
      user_id: user.id,
      destination: destination.trim(),
      purpose: purpose.trim(),
      start_date,
      end_date,
      itinerary: itinerary || null,
      approver_id: userRecord?.manager_id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
