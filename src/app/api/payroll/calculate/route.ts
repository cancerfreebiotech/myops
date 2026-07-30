import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { generatePayrollDrafts } from '@/lib/payroll-calculate'

// T48: Payroll auto-calculation API
// 計算邏輯本體在 @/lib/payroll-calculate（generate-monthly 直接共用同一份函式，
// 不再對自己發 HTTP fetch）；本 route 只負責授權與回應格式。
export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')

  // Support both user auth and cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Called by cron — proceed without user auth
  } else {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

    const { data: currentUser } = await supabase
      .from('users')
      .select('role, job_role, granted_features')
      .eq('id', user.id)
      .single()

    const isAdmin = currentUser?.role === 'admin'
    // hr_manager 可能來自 granted_features 或 job_role（人資長 Eva 是 job_role）
    const isHR = currentUser?.granted_features?.includes('hr_manager')
      || currentUser?.job_role === 'hr_manager'
    if (!isAdmin && !isHR) {
      return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    }
  }

  const body = await request.json().catch(() => ({}))
  const rawYear = Number(body?.year)
  const rawMonth = Number(body?.month)
  const now = new Date()
  const year = Number.isInteger(rawYear) && rawYear >= 2020 && rawYear <= 2099 ? rawYear : now.getFullYear()
  const month = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : now.getMonth() + 1

  const result = await generatePayrollDrafts(year, month)

  if (result.kind === 'no_eligible_employees') {
    return NextResponse.json({ data: { generated: 0, year, month, message: t('payrollCalculate.noEligibleEmployees') } })
  }

  // 部分寫入失敗、或有人因未填月薪被跳過，都要說出來，
  // 不能只回一個數字讓人以為全部跑完了
  return NextResponse.json({
    data: {
      generated: result.generated,
      total: result.total,
      eligible: result.eligible,
      skipped: result.skippedNoSalary,
      year,
      month,
      ...(result.firstError ? { warning: result.firstError } : {}),
    },
  })
}
