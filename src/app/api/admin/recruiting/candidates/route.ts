import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

const SOURCES = ['referral', 'job_board', 'linkedin', 'agency', 'other']

async function canManage(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  const role = data?.role ?? ''
  // 模組關閉時（feature.recruiting off）非 admin 一律擋下，與頁面 canAccessFeature 一致
  const flags = await getFeatureFlags()
  if (!canAccessFeature(role, flags, 'recruiting')) return false
  return role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('hr_manager')
}

// GET /api/admin/recruiting/candidates?opening_id= — 應徵者列表（含面試記錄）
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const openingId = searchParams.get('opening_id')

  let query = supabase
    .from('candidates')
    .select(`
      *,
      interview_notes(*, interviewer:users!interview_notes_interviewer_id_fkey(display_name)),
      opening:job_openings(title)
    `)
    .order('created_at', { ascending: false })
  if (openingId) query = query.eq('opening_id', openingId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = Record<string, unknown> & { interview_notes: { interview_date: string }[] | null }
  const sorted = ((data ?? []) as unknown as Row[]).map(c => ({
    ...c,
    interview_notes: (c.interview_notes ?? []).sort((a, b) => b.interview_date.localeCompare(a.interview_date)),
  }))
  return NextResponse.json({ data: sorted })
}

// POST /api/admin/recruiting/candidates { opening_id*, name*, email, phone, source, resume_paths }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()
  const { opening_id, name, email, phone, source, resume_paths } = body

  if (!opening_id || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  if (source !== undefined && !SOURCES.includes(source)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('candidates')
    .insert({
      opening_id,
      name: name.trim(),
      email: typeof email === 'string' && email.trim() ? email.trim() : null,
      phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null,
      source: source ?? 'other',
      resume_paths: Array.isArray(resume_paths) ? resume_paths : [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
