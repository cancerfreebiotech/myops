import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { canManageTraining } from '@/lib/training'
import { isValidDateString } from '@/lib/taipei-date'

// GET /api/training/certifications?view=mine|all|due — 證照
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') ?? 'mine'

  let query = supabase
    .from('certifications')
    .select('*, user:users!certifications_user_id_fkey(id, display_name)')
    .is('deleted_at', null)
    .order('expiry_date', { ascending: true, nullsFirst: false })

  if (view === 'mine') {
    query = query.eq('user_id', user.id)
  } else {
    if (!(await canManageTraining(supabase, user.id))) {
      return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    }
    if (view === 'due') {
      const cutoff = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      query = query.lte('expiry_date', cutoff)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/training/certifications — 新增證照（本人或管理者代錄）
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const body = await request.json()
  const { user_id, name, issuer, cert_no, issued_date, expiry_date, attachment_paths, note } = body

  if (!name?.trim()) return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  for (const d of [issued_date, expiry_date]) {
    if (d && !isValidDateString(d)) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
  }

  const targetUserId = user_id || user.id
  if (targetUserId !== user.id && !(await canManageTraining(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('certifications')
    .insert({
      user_id: targetUserId,
      name: name.trim(),
      issuer: issuer || null,
      cert_no: cert_no || null,
      issued_date: issued_date || null,
      expiry_date: expiry_date || null,
      attachment_paths: Array.isArray(attachment_paths) ? attachment_paths : [],
      note: note || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
