import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { GoodsReceiptsClient, type GoodsReceiptRow } from './GoodsReceiptsClient'

// 進貨驗收單 (GR) — list page. Auth + procurement feature gate on the server;
// row interaction / creation happen in the client via /api/procurement/goods-receipts.

export default async function GoodsReceiptsPage() {
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

  const { data: goodsReceipts } = await service
    .from('goods_receipts')
    .select('id, doc_no, status, current_step, pr_id, vendor_name, total_amount, has_deposit, created_at, created_by, pr:purchase_requests(id, doc_no), created_by_user:users!goods_receipts_created_by_fkey(id, display_name)')
    .order('created_at', { ascending: false })
    .limit(200)

  const t = await getTranslations('procurement.goodsReceipts')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <GoodsReceiptsClient initialRows={(goodsReceipts as unknown as GoodsReceiptRow[]) ?? []} />
    </div>
  )
}
