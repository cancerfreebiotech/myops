import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { ONBOARDING_TEMPLATE, OFFBOARDING_TEMPLATE } from '@/lib/lifecycle-templates'

async function canManage(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('hr_manager')
}

// GET /api/admin/lifecycle — 清單（含 items）
export async function GET() {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('lifecycle_checklists')
    .select('*, user:users!lifecycle_checklists_user_id_fkey(id, display_name, email), items:lifecycle_checklist_items(*)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = Record<string, unknown> & { items: { sort_order: number }[] | null }
  const sorted = ((data ?? []) as unknown as Row[]).map(c => ({
    ...c,
    items: (c.items ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }))
  return NextResponse.json({ data: sorted })
}

// POST /api/admin/lifecycle { user_id, kind } — 建立並展開範本
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!(await canManage(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { user_id, kind } = await request.json()
  if (!user_id || !['onboarding', 'offboarding'].includes(kind)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data: checklist, error } = await supabase
    .from('lifecycle_checklists')
    .insert({ user_id, kind, created_by: user.id })
    .select()
    .single()
  if (error || !checklist) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  const template = kind === 'onboarding' ? ONBOARDING_TEMPLATE : OFFBOARDING_TEMPLATE
  const { error: itemsErr } = await supabase.from('lifecycle_checklist_items').insert(
    template.map((item, i) => ({
      checklist_id: checklist.id,
      title: item.title,
      category: item.category,
      sort_order: i,
    }))
  )
  if (itemsErr) {
    await supabase.from('lifecycle_checklists').delete().eq('id', checklist.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  return NextResponse.json({ data: checklist })
}
