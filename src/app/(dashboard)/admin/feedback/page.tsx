import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { FeedbackAdmin } from './FeedbackAdmin'

export default async function FeedbackAdminPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (currentUser?.role !== 'admin') redirect('/')

  const { data: feedbacks } = await service
    .from('feedback')
    .select(`*, user:users!feedback_submitted_by_fkey(id, display_name)`)
    .order('created_at', { ascending: false })

  const t = await getTranslations('admin.feedback')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <FeedbackAdmin feedbacks={feedbacks ?? []} />
    </div>
  )
}
