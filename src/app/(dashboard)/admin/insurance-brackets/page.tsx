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
    .select('role, job_role')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const isFinance = currentUser?.job_role === 'finance'
  const isCOO = currentUser?.job_role === 'coo'
  if (!isAdmin && !isFinance && !isCOO) redirect('/no-permission')

  // 部分工時級距的 grade 為 0，排序以投保薪資為準才會排在數字級距之前
  const { data: laborBrackets } = await service
    .from('labor_insurance_brackets')
    .select('*')
    .order('effective_year', { ascending: false })
    .order('insured_salary', { ascending: true })

  const { data: healthBrackets } = await service
    .from('health_insurance_brackets')
    .select('*')
    .order('effective_year', { ascending: false })
    .order('insured_salary', { ascending: true })

  // 勞退月提繳工資分級表（Linda 7/30 回報 774a2ea3）
  const { data: pensionBrackets } = await service
    .from('pension_wage_brackets')
    .select('*')
    .order('effective_year', { ascending: false })
    .order('contribution_wage', { ascending: true })

  const t = await getTranslations('admin.insuranceBrackets')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <InsuranceBracketsClient
        initialLaborBrackets={laborBrackets ?? []}
        initialHealthBrackets={healthBrackets ?? []}
        initialPensionBrackets={pensionBrackets ?? []}
      />
    </div>
  )
}
