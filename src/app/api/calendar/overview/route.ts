import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// GET /api/calendar/overview?month=YYYY-MM
// 彙總當月：公司活動 + 已核准請假 + 已核准出差
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  const [y, m] = month.split('-').map(Number)
  const monthStart = `${month}-01`
  const monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  // 與當月重疊：start < 月底 AND end >= 月初
  const [events, leaves, trips] = await Promise.all([
    supabase
      .from('company_events')
      .select('id, title, description, start_date, end_date')
      .is('deleted_at', null)
      .lt('start_date', monthEnd)
      .gte('end_date', monthStart),
    supabase
      .from('leave_requests')
      .select('id, start_date, end_date, user:users!leave_requests_user_id_fkey(display_name), leave_type:leave_types(name:name_zh)')
      .eq('status', 'approved')
      .lt('start_date', monthEnd)
      .gte('end_date', monthStart),
    supabase
      .from('business_trips')
      .select('id, destination, start_date, end_date, user:users!business_trips_user_id_fkey(display_name)')
      .eq('status', 'approved')
      .lt('start_date', monthEnd)
      .gte('end_date', monthStart),
  ])

  return NextResponse.json({
    data: {
      events: events.data ?? [],
      leaves: leaves.data ?? [],
      trips: trips.data ?? [],
    },
  })
}
