import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnnouncementDetail } from './AnnouncementDetail'

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch current user with language preference
  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, granted_features, display_name, language')
    .eq('id', user.id)
    .single()

  // Fetch document (announcements and regulations only)
  const { data: doc } = await service
    .from('documents')
    .select(
      `
      *,
      uploaded_by_user:users!documents_uploaded_by_fkey(id, display_name),
      department:departments(id, name)
    `
    )
    .eq('id', id)
    .in('doc_type', ['ANN', 'REG'])
    .is('deleted_at', null)
    .single()

  if (!doc) notFound()

  // Fetch recipient record for current user
  const { data: myRecipientRecord } = await service
    .from('document_recipients')
    .select('id, user_id, confirmed_at, requires_confirmation')
    .eq('document_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  // Fetch confirmation record for current user (also check document_confirmations if separate table)
  // The confirm endpoint updates document_recipients.confirmed_at, so myRecipientRecord covers it
  const isRecipient = myRecipientRecord !== null
  const alreadyConfirmed = myRecipientRecord?.confirmed_at != null

  // Fetch audit logs for this document
  const { data: auditLogs } = await service
    .from('audit_logs')
    .select(`*, user:users!audit_logs_user_id_fkey(id, display_name)`)
    .eq('doc_id', id)
    .order('created_at', { ascending: false })

  // Determine content language based on user preference, fallback chain:
  // user.language → source lang (content_zh always present as source)
  const userLang = currentUser?.language ?? 'zh'

  return (
    <div>
      <PageHeader
        title={doc.title}
        description={`${doc.doc_type === 'REG' ? '規章' : '公告'} · ${doc.announcement_category ?? ''}`}
      />
      <AnnouncementDetail
        doc={doc}
        auditLogs={auditLogs ?? []}
        currentUser={currentUser}
        isRecipient={isRecipient}
        alreadyConfirmed={alreadyConfirmed}
        confirmedAt={myRecipientRecord?.confirmed_at ?? null}
        userLang={userLang}
      />
    </div>
  )
}
