import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnnouncementsClient } from './AnnouncementsClient'

export default async function AnnouncementsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, granted_features, display_name')
    .eq('id', user.id)
    .single()

  const canPublish = currentUser?.role === 'admin' ||
    currentUser?.granted_features?.includes('publish_announcement')

  // Publisher report: unconfirmed counts per announcement
  let reportData: any[] = []
  if (canPublish) {
    const { data } = await service
      .from('documents')
      .select(`
        id, title, created_at, announcement_category, status,
        document_recipients(count),
        document_recipients_confirmed:document_recipients(count)
      `)
      .in('doc_type', ['ANN', 'REG'])
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
    reportData = data ?? []
  }

  const t = await getTranslations('announcements')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AnnouncementsClient
        currentUser={currentUser}
        canPublish={canPublish}
        reportData={reportData}
        userId={user.id}
      />
    </div>
  )
}
