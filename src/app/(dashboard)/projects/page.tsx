import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProjectsClient } from './ProjectsClient'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, display_name, granted_features')
    .eq('id', user.id)
    .single()

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'projects')) redirect('/no-permission')

  const isAdmin = currentUser?.role === 'admin'
  // 與 RLS「projects: manage_projects or admin can write」一致（has_feature 只看 granted_features 欄位）
  const canCreate = isAdmin || !!(currentUser?.granted_features as string[] | null)?.includes('manage_projects')

  const { data: projects } = await service
    .from('projects')
    .select(`
      *,
      owner:users!projects_project_lead_id_fkey(id, display_name),
      members:project_members(user_id, user:users!project_members_user_id_fkey(id, display_name))
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const { data: allUsers } = await service
    .from('users')
    .select('id, display_name')
    .eq('is_active', true)
    .order('display_name')

  const t = await getTranslations('projects')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <ProjectsClient
        projects={projects ?? []}
        allUsers={allUsers ?? []}
        currentUser={currentUser}
        isAdmin={isAdmin}
        canCreate={canCreate}
      />
    </div>
  )
}
