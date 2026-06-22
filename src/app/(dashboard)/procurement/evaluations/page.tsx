import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { EvaluationsClient, type VendorEvalRow, type ProductEvalRow } from './EvaluationsClient'

// 審核評估單 — vendor & product evaluations (Phase A end-to-end demo documents).
// Auth + feature gate on the server; data interaction happens in the client
// via /api/procurement/evaluations.

export default async function EvaluationsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, job_role, granted_features, display_name')
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

  const [{ data: vendorEvaluations }, { data: productEvaluations }] = await Promise.all([
    service
      .from('vendor_evaluations')
      .select('id, doc_no, status, current_step, name, short_name, vendor_category, created_at, created_by, created_by_user:users!vendor_evaluations_created_by_fkey(id, display_name)')
      .order('created_at', { ascending: false })
      .limit(200),
    service
      .from('product_evaluations')
      .select('id, doc_no, status, current_step, rfq_id, notes, created_at, created_by, rfq:rfqs(id, doc_no), created_by_user:users!product_evaluations_created_by_fkey(id, display_name)')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const t = await getTranslations('procurement.evaluations')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <EvaluationsClient
        initialVendorEvaluations={(vendorEvaluations as unknown as VendorEvalRow[]) ?? []}
        initialProductEvaluations={(productEvaluations as unknown as ProductEvalRow[]) ?? []}
      />
    </div>
  )
}
