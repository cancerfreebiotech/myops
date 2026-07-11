import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

const STATUSES = ['open', 'paused', 'closed']

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

// GET /api/admin/recruiting/openings — 職缺列表（含各應徵者階段）
export async function GET() {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('job_openings')
    .select('*, candidates(id, stage)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/admin/recruiting/openings { title*, department_id, description, requirements, headcount, status }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()
  const { title, department_id, description, requirements, headcount, status } = body

  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  if (status !== undefined && !STATUSES.includes(status)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  const numHeadcount = headcount === undefined ? 1 : Number(headcount)
  if (!Number.isInteger(numHeadcount) || numHeadcount < 1) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('job_openings')
    .insert({
      title: title.trim(),
      department_id: department_id || null,
      description: typeof description === 'string' && description.trim() ? description.trim() : null,
      requirements: typeof requirements === 'string' && requirements.trim() ? requirements.trim() : null,
      headcount: numHeadcount,
      status: status ?? 'open',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
