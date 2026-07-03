import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { canManageTraining } from '@/lib/training'

// GET /api/training/records?view=mine|all — 訓練記錄
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') ?? 'mine'

  let query = supabase
    .from('training_records')
    .select('*, course:training_courses(id, title, category, hours, is_required, material_url), user:users!training_records_user_id_fkey(id, display_name)')
    .order('assigned_at', { ascending: false })

  if (view === 'mine') {
    query = query.eq('user_id', user.id)
  } else if (!(await canManageTraining(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/training/records — 指派課程 { course_id, user_ids: [] }（admin / training_manage）
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  if (!(await canManageTraining(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { course_id, user_ids } = await request.json()
  if (!course_id || !Array.isArray(user_ids) || !user_ids.length) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data: course } = await supabase
    .from('training_courses')
    .select('id, hours')
    .eq('id', course_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!course) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const { data, error } = await supabase
    .from('training_records')
    .upsert(
      user_ids.map((uid: string) => ({ course_id, user_id: uid, hours: course.hours })),
      { onConflict: 'course_id,user_id', ignoreDuplicates: true },
    )
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
