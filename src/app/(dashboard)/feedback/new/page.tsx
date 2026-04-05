import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { FeedbackForm } from './FeedbackForm'

export default async function FeedbackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const t = await getTranslations('feedback')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <FeedbackForm />
    </div>
  )
}
