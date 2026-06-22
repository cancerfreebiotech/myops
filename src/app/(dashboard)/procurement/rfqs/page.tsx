import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { RFQ_LIST_SELECT } from '@/app/api/procurement/rfqs/helpers'
import type { RfqListRow, UserOption } from './shared'
import { RfqsClient } from './RfqsClient'

// 詢價單 (RFQ) — list page. Auth + 'procurement' feature flag +
// procurement_unit / procurement_manage gate on the server; the client talks
// to /api/procurement/rfqs for filtering and creation.

export default async function RfqsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, job_role, granted_features')
    .eq('id', user.id)
    .single()
  if (!currentUser) redirect('/login')

  const role = currentUser.role ?? ''
  const jobRole = currentUser.job_role ?? ''
  const granted = (currentUser.granted_features as string[] | null) ?? []

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(role, featureFlags, 'procurement')) redirect('/no-permission')

  const canRead =
    userHasFeature(role, jobRole, granted, 'procurement_unit') ||
    userHasFeature(role, jobRole, granted, 'procurement_manage')
  if (!canRead) redirect('/no-permission')

  const [{ data: rfqs }, { data: users }] = await Promise.all([
    service
      .from('rfqs')
      .select(RFQ_LIST_SELECT)
      .order('created_at', { ascending: false })
      .limit(200),
    service
      .from('users')
      .select('id, display_name')
      .eq('is_active', true)
      .order('display_name', { ascending: true }),
  ])

  const t = await getTranslations('procurement.rfqs')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <RfqsClient
        initialRfqs={(rfqs as unknown as RfqListRow[]) ?? []}
        users={(users as UserOption[]) ?? []}
        meId={user.id}
      />
    </div>
  )
}
