import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { GoodsReceiptDetailClient } from './GoodsReceiptDetailClient'

// 進貨驗收單 detail — 43-column sectioned form + deposit / invoice blocks,
// approval timeline, convert (入庫單 / 請款單) and void-and-clone actions.
// Auth + feature gate on the server; the document itself is loaded in the
// client via /api/procurement/goods-receipts/[id].

export default async function GoodsReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
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

  // 「轉為資產」按鈕僅 admin / asset_manage 可見（與 /assets 頁面的資產管理權限一致）
  const canConvertToAsset = userHasFeature(currentUser.role, currentUser.job_role, granted, 'asset_manage')

  const t = await getTranslations('procurement.goodsReceipts')

  return (
    <div>
      <PageHeader title={t('detailTitle')} description={t('description')} />
      <GoodsReceiptDetailClient id={id} canConvertToAsset={canConvertToAsset} />
    </div>
  )
}
