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

  // 已核准請假/出差改走 SECURITY DEFINER function，只回安全欄位（不洩漏 reason/purpose/itinerary）
  const [events, leavesRes, tripsRes] = await Promise.all([
    supabase
      .from('company_events')
      .select('id, title, description, start_date, end_date')
      .is('deleted_at', null)
      .lt('start_date', monthEnd)
      .gte('end_date', monthStart),
    supabase.rpc('calendar_overview_leaves', { p_from: monthStart, p_to: monthEnd }),
    supabase.rpc('calendar_overview_trips', { p_from: monthStart, p_to: monthEnd }),
  ])

  type LeaveRow = { id: string; start_date: string; end_date: string; display_name: string | null; leave_type_name: string | null }
  type TripRow = { id: string; start_date: string; end_date: string; display_name: string | null; destination: string }

  const leaves = ((leavesRes.data ?? []) as LeaveRow[]).map(r => ({
    id: r.id, start_date: r.start_date, end_date: r.end_date,
    user: { display_name: r.display_name }, leave_type: { name: r.leave_type_name },
  }))
  const trips = ((tripsRes.data ?? []) as TripRow[]).map(r => ({
    id: r.id, start_date: r.start_date, end_date: r.end_date,
    destination: r.destination, user: { display_name: r.display_name },
  }))

  return NextResponse.json({ data: { events: events.data ?? [], leaves, trips } })
}
