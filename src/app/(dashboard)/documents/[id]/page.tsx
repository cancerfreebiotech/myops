import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { DocumentDetailClient } from './DocumentDetailClient'

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, granted_features, department_id, display_name')
    .eq('id', user.id)
    .single()

  const { data: doc } = await service
    .from('documents')
    .select(`
      *,
      uploaded_by_user:users!documents_uploaded_by_fkey(id, display_name),
      approved_by_user:users!documents_approved_by_fkey(id, display_name),
      company:companies(id, name),
      department:departments(id, name)
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!doc) notFound()

  const { data: auditLogs } = await service
    .from('audit_logs')
    .select(`*, user:users!audit_logs_user_id_fkey(id, display_name)`)
    .eq('doc_id', id)
    .order('created_at', { ascending: false })

  const { data: recipients } = await service
    .from('document_recipients')
    .select(`*, user:users!document_recipients_user_id_fkey(id, display_name)`)
    .eq('document_id', id)
    .order('created_at', { ascending: true })

  const { data: allUsers } = await service
    .from('users')
    .select('id, display_name, department:departments(name)')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('display_name')

  const canApprove = currentUser?.role === 'admin' ||
    currentUser?.granted_features?.includes('approve_contract') ||
    currentUser?.granted_features?.includes('publish_announcement')

  const canPublish = currentUser?.role === 'admin' ||
    currentUser?.granted_features?.includes('publish_announcement')

  // Get signed download URL if there's a file
  let downloadUrl: string | null = null
  if (doc.file_url) {
    const { data: signed } = await service.storage
      .from('documents')
      .createSignedUrl(doc.file_url, 3600)
    downloadUrl = signed?.signedUrl ?? null
  }

  return (
    <div>
      <PageHeader
        title={doc.title}
        description={`${doc.doc_type} · ${doc.folder}`}
      />
      <DocumentDetailClient
        doc={doc}
        auditLogs={auditLogs ?? []}
        recipients={recipients ?? []}
        currentUser={currentUser}
        canApprove={canApprove}
        canPublish={canPublish}
        downloadUrl={downloadUrl}
        allUsers={allUsers ?? []}
      />
    </div>
  )
}
