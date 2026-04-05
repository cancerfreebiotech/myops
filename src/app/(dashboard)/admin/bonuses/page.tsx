import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { BonusClient } from './BonusClient'

export default async function AdminBonusesPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const hasFinance = currentUser?.granted_features?.includes('finance_payroll')
  if (!isAdmin && !hasFinance) redirect('/')

  const currentYear = new Date().getFullYear()

  const { data: bonuses } = await service
    .from('bonus_records')
    .select('*, user:users!bonus_records_user_id_fkey(id, display_name)')
    .eq('year', currentYear)
    .order('created_at', { ascending: false })

  const { data: allUsers } = await service
    .from('users')
    .select('id, display_name')
    .eq('is_active', true)
    .order('display_name')

  const t = await getTranslations('admin.bonuses')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <BonusClient
        initialBonuses={bonuses ?? []}
        allUsers={allUsers ?? []}
        currentYear={currentYear}
      />
    </div>
  )
}
