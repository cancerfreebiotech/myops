import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// 與 RLS「projects: manage_projects or admin can write」一致（has_feature 只看 granted_features 欄位，
// 不含 job_role 預設值）
async function canManageProjects(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('manage_projects')
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  if (!(await canManageProjects(supabase, user.id))) {
    return NextResponse.json({ error: t('common.noWritePermission') }, { status: 403 })
  }

  const { name, description, owner_id } = await request.json()
  if (!name) return NextResponse.json({ error: t('projects.missingName') }, { status: 400 })

  const leadId = owner_id ?? user.id
  const { data, error } = await service.from('projects').insert({
    name, description: description ?? null,
    project_lead_id: leadId,
    status: 'active',
    created_by: user.id,
  }).select().single()

  if (error) {
    console.error('[api/projects] insert failed:', error)
    return NextResponse.json({ error: t('projects.createFailed') }, { status: 400 })
  }

  // Add the project lead as a member
  await service.from('project_members').insert({ project_id: data.id, user_id: leadId })

  return NextResponse.json({ data })
}
