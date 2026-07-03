import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isValidDateString } from '@/lib/taipei-date'

const SOURCES = ['referral', 'job_board', 'linkedin', 'agency', 'other']
const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']

async function canManage(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('hr_manager')
}

// PATCH /api/admin/recruiting/candidates/[id]
//   { stage } 或欄位編輯（name/email/phone/source/resume_paths/note）
//   { add_note: { interview_date*, rating, feedback* } } — 新增面試記錄
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()

  // 新增面試記錄
  if (body.add_note) {
    const { interview_date, rating, feedback } = body.add_note
    if (!isValidDateString(interview_date) || typeof feedback !== 'string' || !feedback.trim()) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    if (rating !== undefined && rating !== null) {
      const numRating = Number(rating)
      if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
        return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
      }
    }

    const { data: candidate } = await supabase
      .from('candidates')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (!candidate) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

    const { data, error } = await supabase
      .from('interview_notes')
      .insert({
        candidate_id: id,
        interviewer_id: user.id,
        interview_date,
        rating: rating === undefined || rating === null ? null : Number(rating),
        feedback: feedback.trim(),
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // 欄位編輯（含 stage）
  const updates: Record<string, unknown> = {}

  if ('stage' in body) {
    if (!STAGES.includes(body.stage)) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    updates.stage = body.stage
  }
  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    updates.name = body.name.trim()
  }
  if ('email' in body) {
    updates.email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null
  }
  if ('phone' in body) {
    updates.phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null
  }
  if ('source' in body) {
    if (!SOURCES.includes(body.source)) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    updates.source = body.source
  }
  if ('resume_paths' in body) {
    if (!Array.isArray(body.resume_paths)) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    updates.resume_paths = body.resume_paths
  }
  if ('note' in body) {
    updates.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('candidates')
    .update(updates)
    .eq('id', id)
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data: data[0] })
}

// DELETE /api/admin/recruiting/candidates/[id] — 刪除應徵者
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('candidates')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data: null })
}
