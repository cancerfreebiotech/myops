import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { PayrollDetailClient, type PayrollDetail } from './PayrollDetailClient'

// 薪資明細（Linda 7/29 回報 76821eb3 的第一階段）：人資從薪資表點員工進來，
// 看單一月份的薪資組成。她要求的順序是「先能看組成 → 再拆明細項 → 最後才改公式與格式」，
// 所以這一頁刻意只呈現既有欄位，不新增任何計算。

/** 員工本人可看到的狀態：與薪資表「我的薪資單」一致，不讓直接輸入網址看到未完成的薪資 */
const SELF_VISIBLE_STATUSES = ['coo_approved', 'paid']

export default async function PayrollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 先查再判斷：payroll_records 的 SELECT 政策是「本人 or hr_manager / finance_payroll /
  // coo_notify / admin」，並**不含** app 端的 view_payroll。若先用 app 旗標放行、再假設查得到列，
  // 兩層權限一旦分歧就會出現「有權限卻整頁空白」。查不到列就一律當作沒權限。
  const { data: record } = await supabase
    .from('payroll_records')
    .select('*, user:users!payroll_records_user_id_fkey(id, display_name, department:departments(name))')
    .eq('id', id)
    .maybeSingle()
  if (!record) redirect('/no-permission')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, granted_features')
    .eq('id', user.id)
    .single()

  const isHR = currentUser?.role === 'admin' || currentUser?.role === 'hr'
  const canViewPayroll = isHR || !!currentUser?.granted_features?.includes('view_payroll')
  const isSelf = record.user_id === user.id

  if (!canViewPayroll && (!isSelf || !SELF_VISIBLE_STATUSES.includes(record.status))) {
    redirect('/no-permission')
  }

  // 簽核軌跡的人名：users 的 SELECT 政策允許已登入者讀在職使用者
  const actorIds = Array.from(new Set(
    ['hr_reviewed_by', 'finance_confirmed_by', 'coo_approved_by', 'paid_by', 'rejected_by']
      .map(k => (record as Record<string, unknown>)[k])
      .filter((v): v is string => typeof v === 'string')
  ))
  const actorNames: Record<string, string | null> = {}
  if (actorIds.length > 0) {
    const { data: actors } = await supabase.from('users').select('id, display_name').in('id', actorIds)
    for (const a of actors ?? []) actorNames[a.id] = a.display_name
  }

  const t = await getTranslations('payroll')

  return (
    <div>
      <PageHeader
        title={t('detailTitle', { year: record.year, month: record.month })}
        description={t('detailDescription')}
      />
      <PayrollDetailClient
        record={record as unknown as PayrollDetail}
        actorNames={actorNames}
        canViewPayroll={canViewPayroll}
      />
    </div>
  )
}
