import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProjectDetail } from './ProjectDetail'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, display_name')
    .eq('id', user.id)
    .single()

  const { data: project } = await service
    .from('projects')
    .select(`
      *,
      owner:users!projects_owner_id_fkey(id, display_name),
      members:project_members(
        user_id,
        role,
        user:users!project_members_user_id_fkey(id, display_name)
      )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!project) notFound()

  // Access check: only admin, project lead, or project members can view
  const isMember = project.members?.some((m: any) => m.user_id === currentUser?.id)
  const isProjectLead = project.project_lead_id === currentUser?.id
  if (currentUser?.role !== 'admin' && !isProjectLead && !isMember) {
    redirect('/projects')
  }

  const { data: overtimeRequests } = await service
    .from('overtime_requests')
    .select(`
      *,
      user:users!overtime_requests_user_id_fkey(id, display_name)
    `)
    .eq('project_id', id)
    .order('date', { ascending: false })

  // All active users for "add member" dialog
  const { data: allUsers } = await service
    .from('users')
    .select('id, display_name')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('display_name')

  const isAdmin = currentUser?.role === 'admin'
  const isLead =
    project.owner_id === currentUser?.id ||
    project.members?.some((m: any) => m.user_id === currentUser?.id && m.role === 'lead')

  const t = await getTranslations('projects')

  return (
    <div>
      <PageHeader
        title={project.name}
        description={project.description ?? t('detail')}
      />
      <ProjectDetail
        project={project}
        overtimeRequests={overtimeRequests ?? []}
        allUsers={allUsers ?? []}
        currentUser={currentUser}
        canManageMembers={isAdmin || isLead}
      />
    </div>
  )
}
