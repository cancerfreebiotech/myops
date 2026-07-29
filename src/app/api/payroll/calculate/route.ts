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
      .select('role, granted_features')
      .eq('id', user.id)
      .single()

    const isAdmin = currentUser?.role === 'admin'
    const isHR = currentUser?.granted_features?.includes('hr_manager')
    if (!isAdmin && !isHR) {
      return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    }
  }

  const body = await request.json()
  const year = body.year ?? new Date().getFullYear()
  const month = body.month ?? new Date().getMonth() + 1

  const result = await generatePayrollDrafts(year, month)

  if (result.kind === 'no_eligible_employees') {
    return NextResponse.json({ data: { generated: 0, message: t('payrollCalculate.noEligibleEmployees') } })
  }

  return NextResponse.json({ data: { generated: result.generated, total: result.total } })
}
