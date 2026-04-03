import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProjectsClient } from './ProjectsClient'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, display_name')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'

  const { data: projects } = await service
    .from('projects')
    .select(`
      *,
      owner:users!projects_owner_id_fkey(id, display_name),
      members:project_members(user_id, role, user:users!project_members_user_id_fkey(id, display_name))
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const { data: allUsers } = await service
    .from('users')
    .select('id, display_name')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('display_name')

  return (
    <div>
      <PageHeader title="專案管理" description="建立專案、管理成員" />
      <ProjectsClient
        projects={projects ?? []}
        allUsers={allUsers ?? []}
        currentUser={currentUser}
        isAdmin={isAdmin}
      />
    </div>
  )
}
