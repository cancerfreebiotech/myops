import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isValidDateString } from '@/lib/taipei-date'

async function canManageEvents(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('hr_manager')
}

// POST /api/calendar/events { title, description, start_date, end_date }（admin / hr_manager）
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  if (!(await canManageEvents(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { title, description, start_date, end_date } = await request.json()
  const endDate = end_date || start_date
  if (!title?.trim() || !isValidDateString(start_date) || !isValidDateString(endDate) || endDate < start_date) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('company_events')
    .insert({
      title: title.trim(),
      description: description || null,
      start_date,
      end_date: endDate,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
