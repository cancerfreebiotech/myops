import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { PaymentsClient, type DepositRow, type ApRow, type InstallmentRow } from './PaymentsClient'

// 請款三單 — deposit / ap / installment payment requests, three-tab list.
// Auth + 'procurement' feature flag gate on the server; row actions go through
// /api/procurement/payments.

export default async function PaymentsPage() {
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

  const [{ data: deposits }, { data: aps }, { data: installments }] = await Promise.all([
    service
      .from('deposit_requests')
      .select('id, doc_no, status, current_step, vendor_name, vendor_short_name, deposit_amount, total_amount, remittance_deadline, created_at, created_by, pr:purchase_requests(id, doc_no), created_by_user:users!deposit_requests_created_by_fkey(id, display_name)')
      .order('created_at', { ascending: false })
      .limit(200),
    service
      .from('ap_requests')
      .select('id, doc_no, status, current_step, vendor_name, billing_month, total_amount, is_installment, created_at, created_by, gr:goods_receipts(id, doc_no), created_by_user:users!ap_requests_created_by_fkey(id, display_name)')
      .order('created_at', { ascending: false })
      .limit(200),
    service
      .from('installment_requests')
      .select('id, doc_no, status, current_step, installment_no, billing_month, amount, invoice_no, created_at, created_by, ap:ap_requests(id, doc_no), created_by_user:users!installment_requests_created_by_fkey(id, display_name)')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const t = await getTranslations('procurement.payments')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <PaymentsClient
        initialDeposits={(deposits as unknown as DepositRow[]) ?? []}
        initialAps={(aps as unknown as ApRow[]) ?? []}
        initialInstallments={(installments as unknown as InstallmentRow[]) ?? []}
      />
    </div>
  )
}
