import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnnouncementsClient, type ReportDoc } from './AnnouncementsClient'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

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

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'announcements')) redirect('/no-permission')

  const canPublish = currentUser?.role === 'admin' ||
    currentUser?.granted_features?.includes('publish_announcement')

  // Publisher report: recipient totals + unconfirmed counts per announcement
  let reportData: ReportDoc[] = []
  if (canPublish) {
    const { data: docs } = await service
      .from('documents')
      .select(`
        id, title, created_at, announcement_category, status, last_reminded_at,
        document_recipients(count)
      `)
      .in('doc_type', ['ANN', 'REG'])
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    const docIds = (docs ?? []).map((d) => d.id)
    const unconfirmedMap = new Map<string, number>()
    if (docIds.length) {
      const { data: unconfirmedRows } = await service
        .from('document_recipients')
        .select('document_id')
        .in('document_id', docIds)
        .eq('requires_confirmation', true)
        .is('confirmed_at', null)
      for (const r of unconfirmedRows ?? []) {
        unconfirmedMap.set(r.document_id, (unconfirmedMap.get(r.document_id) ?? 0) + 1)
      }
    }

    reportData = (docs ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      created_at: d.created_at,
      announcement_category: d.announcement_category,
      status: d.status,
      recipient_count: (d.document_recipients as { count: number }[] | null)?.[0]?.count ?? 0,
      unconfirmed_count: unconfirmedMap.get(d.id) ?? 0,
      last_reminded_at: d.last_reminded_at ?? null,
    }))
  }

  const t = await getTranslations('announcements')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AnnouncementsClient
        canPublish={canPublish}
        reportData={reportData}
      />
    </div>
  )
}
