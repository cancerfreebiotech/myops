import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnnualPayrollClient } from './AnnualPayrollClient'

interface PageProps {
  searchParams: Promise<{ year?: string }>
}

export default async function AnnualPayrollPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, display_name, granted_features')
    .eq('id', user.id)
    .single()

  const isHR = currentUser?.role === 'admin' || currentUser?.role === 'hr_manager' || currentUser?.role === 'hr'
  const canViewPayroll = isHR || currentUser?.granted_features?.includes('view_payroll')

  const sp = await searchParams
  const now = new Date()
  const year = parseInt(sp.year ?? String(now.getFullYear()))

  // Fetch current user's annual payroll records (all months)
  const { data: myAnnualRecords } = await supabase
    .from('payroll_records')
    .select('id, year, month, base_salary, overtime_pay, bonus, deductions, net_salary, status')
    .eq('user_id', user.id)
    .eq('year', year)
    .order('month', { ascending: true })

  // HR/admin: fetch all active users + their annual records
  let allUsers: any[] = []
  let allAnnualRecords: any[] = []

  if (isHR) {
    const { data: usersData } = await service
      .from('users')
      .select('id, display_name, department:departments(name), employment_type')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('display_name')
    allUsers = usersData ?? []

    const { data: allRecordsData } = await service
      .from('payroll_records')
      .select('id, user_id, year, month, base_salary, overtime_pay, bonus, deductions, net_salary, status')
      .eq('year', year)
      .order('month', { ascending: true })
    allAnnualRecords = allRecordsData ?? []
  }

  return (
    <div>
      <PageHeader
        title="全年薪資總覽"
        description="查看全年每月薪資明細與統計"
      />
      <AnnualPayrollClient
        currentUser={currentUser}
        myAnnualRecords={myAnnualRecords ?? []}
        allUsers={allUsers}
        allAnnualRecords={allAnnualRecords}
        isHR={isHR}
        canViewPayroll={canViewPayroll ?? false}
        initialYear={year}
        currentYear={now.getFullYear()}
      />
    </div>
  )
}
