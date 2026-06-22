import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { PR_LIST_SELECT } from '@/app/api/procurement/purchase-requests/helpers'
import { PurchaseRequestsClient, type PurchaseRequestRow } from './PurchaseRequestsClient'

// 請採購單 — purchase request list. Auth + feature gate on the server;
// data interaction happens in the client via /api/procurement/purchase-requests.

export default async function PurchaseRequestsPage() {
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

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser.role, featureFlags, 'procurement')) redirect('/no-permission')

  const granted = (currentUser.granted_features as string[] | null) ?? []
  const hasAccess =
    userHasFeature(currentUser.role, currentUser.job_role, granted, 'procurement_unit') ||
    userHasFeature(currentUser.role, currentUser.job_role, granted, 'procurement_manage')
  if (!hasAccess) redirect('/no-permission')

  const { data: purchaseRequests } = await service
    .from('purchase_requests')
    .select(PR_LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(200)

  const t = await getTranslations('procurement.purchaseRequests')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <PurchaseRequestsClient initialRows={(purchaseRequests as unknown as PurchaseRequestRow[]) ?? []} />
    </div>
  )
}
