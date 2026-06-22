import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import { PaymentDetailClient } from './PaymentDetailClient'

// 請款單詳情 — deposit / ap / installment payment request detail with the
// shared approval timeline + actions. Auth + 'procurement' flag gate on the
// server; the document itself is fetched client-side from
// /api/procurement/payments/[kind]/[id] so approvals can refresh in place.

const KINDS = ['deposit', 'ap', 'installment'] as const
type Kind = (typeof KINDS)[number]

export default async function PaymentDetailPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  if (!(KINDS as readonly string[]).includes(kind)) notFound()

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

  const t = await getTranslations('procurement.payments')

  return (
    <div>
      <PageHeader title={t(`detailTitle.${kind as Kind}`)} description={t('description')} />
      <PaymentDetailClient kind={kind as Kind} id={id} />
    </div>
  )
}
