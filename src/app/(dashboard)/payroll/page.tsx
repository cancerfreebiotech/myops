import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { PayrollClient, type PayrollRecord } from './PayrollClient'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'

export default async function PayrollPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, granted_features, display_name')
    .eq('id', user.id)
    .single()

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser?.role ?? '', featureFlags, 'payroll')) redirect('/no-permission')

  const isHR = currentUser?.role === 'admin' || currentUser?.role === 'hr'
  const canViewPayroll = isHR || currentUser?.granted_features?.includes('view_payroll')
  const canConfirmPayroll = currentUser?.granted_features?.includes('confirm_payroll') || currentUser?.role === 'admin'
  const canApprovePayroll = currentUser?.granted_features?.includes('approve_payroll') || currentUser?.role === 'admin'

  // Current month records
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  let payrollRecords: PayrollRecord[] = []
  if (canViewPayroll) {
    const { data } = await service
      .from('payroll_records')
      .select(`*, user:users!payroll_records_user_id_fkey(id, display_name, department:departments(name))`)
      .eq('year', year)
      .eq('month', month)
      .order('created_at', { ascending: false })
    payrollRecords = data ?? []
  }

  // My own payslips
  const { data: myPayslips } = await supabase
    .from('payroll_records')
    .select(`*, user:users!payroll_records_user_id_fkey(id, display_name)`)
    .eq('user_id', user.id)
    .in('status', ['paid', 'coo_approved'])
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(12)

  const { data: allUsers } = isHR ? await service
    .from('users')
    .select('id, display_name, department:departments(name)')
    .eq('is_active', true)
    .order('display_name') : { data: [] }

  // 批次計算的授權條件必須與 /api/payroll/calculate 完全一致（admin 或 hr_manager），
  // 否則會出現「看得到按鈕、按下去 403」。
  const canGenerate = currentUser?.role === 'admin' || !!currentUser?.granted_features?.includes('hr_manager')

  // 重算會把當月既有薪資單壓回草稿並清掉簽核軌跡，按下去之前必須先講清楚會覆寫幾筆。
  // 這個數字在伺服器端獨立查，不從 payrollRecords 推導——後者只在 canViewPayroll 時才載入，
  // 若日後有人只有 hr_manager 而沒有 view_payroll，警告會無聲消失。
  let lockedCount = 0
  if (canGenerate) {
    const { count } = await service
      .from('payroll_records')
      .select('id', { count: 'exact', head: true })
      .eq('year', year)
      .eq('month', month)
      .neq('status', 'draft')
    lockedCount = count ?? 0
  }

  // 級距表沒上傳時，計算出來的勞保費／健保費會是 0（findBracket 查不到就回 0），
  // 這是靜默的錯誤結果——先在畫面上警告，不要讓人事以為算好了。
  let bracketsReady = true
  if (canGenerate) {
    const [{ count: laborCount }, { count: healthCount }] = await Promise.all([
      service.from('labor_insurance_brackets').select('grade', { count: 'exact', head: true }).eq('effective_year', year),
      service.from('health_insurance_brackets').select('grade', { count: 'exact', head: true }).eq('effective_year', year),
    ])
    bracketsReady = (laborCount ?? 0) > 0 && (healthCount ?? 0) > 0
  }

  const t = await getTranslations('payroll')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <PayrollClient
        currentUser={currentUser}
        payrollRecords={payrollRecords}
        myPayslips={myPayslips ?? []}
        allUsers={allUsers ?? []}
        isHR={isHR}
        canViewPayroll={canViewPayroll}
        canConfirmPayroll={canConfirmPayroll}
        canApprovePayroll={canApprovePayroll}
        canGenerate={canGenerate}
        bracketsReady={bracketsReady}
        lockedCount={lockedCount}
        currentYear={year}
        currentMonth={month}
      />
    </div>
  )
}
