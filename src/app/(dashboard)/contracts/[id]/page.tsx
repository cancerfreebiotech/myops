import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { ContractDetail } from './ContractDetail'

const CONTRACT_DOC_TYPES = ['NDA', 'MOU', 'CONTRACT', 'AMEND']

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, granted_features, display_name')
    .eq('id', user.id)
    .single()

  const { data: doc } = await service
    .from('documents')
    .select(`
      *,
      uploaded_by_user:users!documents_uploaded_by_fkey(id, display_name),
      approved_by_user:users!documents_approved_by_fkey(id, display_name),
      company:companies(id, name)
    `)
    .eq('id', id)
    .in('doc_type', CONTRACT_DOC_TYPES)
    .is('deleted_at', null)
    .single()

  if (!doc) notFound()

  // Fetch related documents from the same company
  let relatedDocs: any[] = []
  if (doc.company_id) {
    const { data } = await service
      .from('documents')
      .select('id, title, doc_type, status, created_at')
      .eq('company_id', doc.company_id)
      .in('doc_type', CONTRACT_DOC_TYPES)
      .neq('id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10)
    relatedDocs = data ?? []
  }

  const { data: auditLogs } = await service
    .from('audit_logs')
    .select(`*, user:users!audit_logs_user_id_fkey(id, display_name)`)
    .eq('doc_id', id)
    .order('created_at', { ascending: false })

  // Fetch signed download URL
  let downloadUrl: string | null = null
  if (doc.file_url) {
    const { data: signed } = await service.storage
      .from('documents')
      .createSignedUrl(doc.file_url, 3600)
    downloadUrl = signed?.signedUrl ?? null
  }

  const canApprove =
    currentUser?.role === 'admin' ||
    currentUser?.granted_features?.includes('approve_contract')

  return (
    <div>
      <PageHeader
        title={doc.title}
        description={`合約詳情 · ${doc.company?.name ?? ''}`}
      />
      <ContractDetail
        doc={doc}
        relatedDocs={relatedDocs}
        auditLogs={auditLogs ?? []}
        downloadUrl={downloadUrl}
        currentUser={currentUser}
        canApprove={canApprove}
      />
    </div>
  )
}
