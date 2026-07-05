import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isValidDateString } from '@/lib/taipei-date'
import { getTranslations } from 'next-intl/server'

const CATEGORIES = ['transport', 'travel', 'meal', 'supplies', 'other']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getApproverInfo(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  const isApprover = data?.role === 'admin' || (data?.granted_features as string[] | null)?.includes('expense_approve')
  return { isApprover: !!isApprover }
}

// GET /api/expenses?view=mine|approve|all&month=YYYY-MM
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') ?? 'mine'
  const month = searchParams.get('month')

  let query = supabase
    .from('expense_claims')
    .select(`
      *,
      user:users!expense_claims_user_id_fkey(id, display_name, email),
      reviewer:users!expense_claims_reviewed_by_fkey(id, display_name),
      trip:business_trips(id, destination, start_date, end_date)
    `)
    .order('expense_date', { ascending: false })

  if (view === 'mine') {
    query = query.eq('user_id', user.id)
  } else {
    // approve / all 需要審批權限（RLS 也會擋，這裡先給明確 403）
    const { isApprover } = await getApproverInfo(supabase, user.id)
    if (!isApprover) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    if (view === 'approve') query = query.eq('status', 'pending')
  }

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    const start = `${month}-01`
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    query = query.gte('expense_date', start).lt('expense_date', end)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/expenses  { expense_date, category, amount, description, receipt_paths }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const body = await request.json()
  const { expense_date, category, amount, description, receipt_paths, trip_id } = body

  if (!isValidDateString(expense_date) || !CATEGORIES.includes(category) || !description?.trim()) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  const numAmount = Number(amount)
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  // 差旅串接：trip_id 必須屬於本人且已核准，否則不接受（防掛到他人/未核准出差）
  let validTripId: string | null = null
  if (trip_id) {
    if (typeof trip_id !== 'string' || !UUID_RE.test(trip_id)) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    const { data: trip } = await supabase
      .from('business_trips')
      .select('id, user_id, status')
      .eq('id', trip_id)
      .maybeSingle()
    if (!trip || trip.user_id !== user.id || trip.status !== 'approved') {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    validTripId = trip.id
  }

  const { data, error } = await supabase
    .from('expense_claims')
    .insert({
      user_id: user.id,
      expense_date,
      category,
      amount: numAmount,
      description: description.trim(),
      receipt_paths: Array.isArray(receipt_paths) ? receipt_paths : [],
      trip_id: validTripId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
