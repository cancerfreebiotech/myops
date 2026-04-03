import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { FeedbackForm } from './FeedbackForm'

export default async function FeedbackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div>
      <PageHeader title="回饋 / 問題回報" description="新功能需求或 Bug 回報" />
      <FeedbackForm />
    </div>
  )
}
