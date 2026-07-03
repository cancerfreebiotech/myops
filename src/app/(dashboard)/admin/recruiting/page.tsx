import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecruitingClient } from './RecruitingClient'

export default async function RecruitingPage() {
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
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'recruiting')) redirect('/no-permission')

  const canManage = currentUser?.role === 'admin'
    || ((currentUser?.granted_features as string[] | null) ?? []).includes('hr_manager')
  if (!canManage) redirect('/no-permission')

  const { data: departments } = await service
    .from('departments')
    .select('id, name')
    .order('name')

  const t = await getTranslations('recruiting')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <RecruitingClient departments={departments ?? []} />
    </div>
  )
}
