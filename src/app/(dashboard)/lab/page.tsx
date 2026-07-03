import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { PageHeader } from '@/components/layout/PageHeader'
import { LabClient } from './LabClient'

export default async function LabPage() {
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
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'lab_supplies')) redirect('/no-permission')

  const isManager = currentUser?.role === 'admin'
    || ((currentUser?.granted_features as string[] | null) ?? []).includes('lab_manage')

  const t = await getTranslations('lab')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <LabClient isManager={isManager} />
    </div>
  )
}
