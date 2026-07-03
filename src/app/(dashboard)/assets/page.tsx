import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { PageHeader } from '@/components/layout/PageHeader'
import { AssetsClient } from './AssetsClient'

export default async function AssetsPage() {
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
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'assets')) redirect('/no-permission')

  const isManager = currentUser?.role === 'admin'
    || ((currentUser?.granted_features as string[] | null) ?? []).includes('asset_manage')

  const { data: allUsers } = await service
    .from('users')
    .select('id, display_name, email')
    .eq('is_active', true)
    .order('display_name')

  const t = await getTranslations('assets')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AssetsClient isManager={isManager} allUsers={allUsers ?? []} />
    </div>
  )
}
