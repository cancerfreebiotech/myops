import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { PageHeader } from '@/components/layout/PageHeader'
import { ExpensesClient } from './ExpensesClient'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = await createServiceClient()
  const { data: currentUser } = await service
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'expenses')) redirect('/no-permission')

  const isApprover = currentUser?.role === 'admin'
    || ((currentUser?.granted_features as string[] | null) ?? []).includes('expense_approve')

  const t = await getTranslations('expense')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <ExpensesClient isApprover={isApprover} />
    </div>
  )
}
