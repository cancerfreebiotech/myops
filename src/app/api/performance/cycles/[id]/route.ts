import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isValidDateString } from '@/lib/taipei-date'

const TRANSITIONS: Record<string, string[]> = {
  draft: ['open'],
  open: ['closed'],
  closed: ['open'],
}

async function requireHR(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: me } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return me?.role === 'admin' || (me?.granted_features as string[] | null)?.includes('hr_manager')
}

// PATCH /api/performance/cycles/[id] { name?, start_date?, end_date?, status? } — HR/admin
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await requireHR(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data: cycle } = await supabase
    .from('performance_cycles')
    .select('id, status, start_date, end_date')
    .eq('id', id)
    .maybeSingle()
  if (!cycle) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const body = await request.json()
  const updates: Record<string, string> = {}

  if (body.name !== undefined) {
    if (!body.name?.trim()) return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    updates.name = body.name.trim()
  }
  if (body.start_date !== undefined || body.end_date !== undefined) {
    const start = body.start_date ?? cycle.start_date
    const end = body.end_date ?? cycle.end_date
    if (!isValidDateString(start) || !isValidDateString(end) || end < start) {
      return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
    }
    updates.start_date = start
    updates.end_date = end
  }
  if (body.status !== undefined) {
    if (!TRANSITIONS[cycle.status]?.includes(body.status)) {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
    updates.status = body.status
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('performance_cycles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/performance/cycles/[id] — HR/admin，僅限草稿
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await requireHR(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data: cycle } = await supabase
    .from('performance_cycles')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (!cycle) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  if (cycle.status !== 'draft') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { error } = await supabase.from('performance_cycles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
