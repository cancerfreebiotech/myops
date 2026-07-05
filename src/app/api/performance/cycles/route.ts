import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isValidDateString } from '@/lib/taipei-date'

// GET /api/performance/cycles — 考核週期列表（RLS：草稿僅 HR/admin 可見）
export async function GET() {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data, error } = await supabase
    .from('performance_cycles')
    .select('*')
    .order('start_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/performance/cycles { name, start_date, end_date } — HR/admin 建立
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: me } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const isHR = me?.role === 'admin' || (me?.granted_features as string[] | null)?.includes('hr_manager')
  if (!isHR) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const body = await request.json()
  const { name, start_date, end_date } = body
  if (!name?.trim() || !isValidDateString(start_date) || !isValidDateString(end_date) || end_date < start_date) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('performance_cycles')
    .insert({ name: name.trim(), start_date, end_date, created_by: user.id })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
