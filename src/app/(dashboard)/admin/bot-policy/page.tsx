import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { getBotApprovalPolicy } from '@/lib/bot-approval-policy'
import { BotPolicyClient } from './BotPolicyClient'

export default async function BotPolicyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (currentUser?.role !== 'admin') redirect('/no-permission')

  const policy = await getBotApprovalPolicy()
  const t = await getTranslations('admin.botPolicy')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <BotPolicyClient policy={policy} />
    </div>
  )
}
