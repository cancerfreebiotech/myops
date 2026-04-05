import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { InsuranceBracketsClient } from './InsuranceBracketsClient'

export default async function InsuranceBracketsPage() {
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

  const { data: laborBrackets } = await service
    .from('labor_insurance_brackets')
    .select('*')
    .order('effective_year', { ascending: false })
    .order('grade', { ascending: true })

  const { data: healthBrackets } = await service
    .from('health_insurance_brackets')
    .select('*')
    .order('effective_year', { ascending: false })
    .order('grade', { ascending: true })

  const t = await getTranslations('admin.insuranceBrackets')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <InsuranceBracketsClient
        initialLaborBrackets={laborBrackets ?? []}
        initialHealthBrackets={healthBrackets ?? []}
      />
    </div>
  )
}
