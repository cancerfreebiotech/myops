import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { canManageTraining, TRAINING_CATEGORIES } from '@/lib/training'

// GET /api/training/courses — 課程列表（全員；含指派記錄）
export async function GET() {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data, error } = await supabase
    .from('training_courses')
    .select('*, records:training_records(id, user_id, status, completed_at, user:users!training_records_user_id_fkey(display_name))')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/training/courses — 建立課程（admin / training_manage）
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  if (!(await canManageTraining(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()
  const { title, category, description, material_url, hours, is_required } = body
  if (!title?.trim() || !(TRAINING_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('training_courses')
    .insert({
      title: title.trim(),
      category,
      description: description || null,
      material_url: material_url || null,
      hours: Number.isFinite(Number(hours)) ? Number(hours) : 0,
      is_required: !!is_required,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
