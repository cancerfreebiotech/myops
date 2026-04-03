import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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

  return (
    <div>
      <PageHeader title="勞健保級距表" description="上傳及管理年度勞保、健保費率級距表" />
      <InsuranceBracketsClient
        initialLaborBrackets={laborBrackets ?? []}
        initialHealthBrackets={healthBrackets ?? []}
      />
    </div>
  )
}
