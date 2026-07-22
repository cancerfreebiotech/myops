import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { buttonVariants } from '@/components/ui/button'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { MyFeedbackList } from './MyFeedbackList'

export default async function MyFeedbackPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'feedback')) redirect('/no-permission')

  // RLS-scoped client（createServiceClient 帶使用者 JWT）；feedback SELECT 政策已允許本人讀取。
  const { data: feedbacks } = await service
    .from('feedback')
    .select('id, type, title, description, status, screenshot_urls, created_at')
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false })

  const t = await getTranslations('feedback')

  return (
    <div>
      <PageHeader
        title={t('listTitle')}
        description={t('listDescription')}
        actions={
          <Link href="/feedback/new" className={buttonVariants({ size: 'sm' })}>
            <Plus size={15} className="mr-1.5" aria-hidden="true" />
            {t('newFeedback')}
          </Link>
        }
      />
      <MyFeedbackList feedbacks={feedbacks ?? []} />
    </div>
  )
}
