import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { FeedbackForm } from './FeedbackForm'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

export default async function FeedbackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'feedback')) redirect('/')

  const t = await getTranslations('feedback')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <FeedbackForm />
    </div>
  )
}
