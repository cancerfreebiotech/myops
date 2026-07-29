import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { sendProactiveMessages } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'
import { generatePayrollDrafts } from '@/lib/payroll-calculate'

// T49: Monthly payroll auto-generation endpoint
// Can be called by pg_cron or Supabase Edge Function on the 1st of each month
// Also callable manually by admin/HR from the admin payroll page
export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')

  // Verify caller is either admin or has a valid cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Called by cron — proceed
  } else {
    // Called by user — check permissions
    const { createClient } = await import('@/lib/supabase/server')
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

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // 直接呼叫與 /api/payroll/calculate 共用的同一份計算函式。
  // 原本這裡是用 NEXT_PUBLIC_APP_URL 對自己發一次 HTTP fetch 再轉發 cookie／cron secret：
  // serverless 上不可靠（網址設錯、內部不可達、冷啟逾時都會整包失敗），且多一次網路往返。
  // 授權沒有變弱——舊寫法在 CRON_SECRET 存在時一律帶 cron header 進 calculate，
  // 真正的閘門本來就只有本 route 上面那段 admin / hr_manager 檢查。
  let result: Awaited<ReturnType<typeof generatePayrollDrafts>>
  try {
    result = await generatePayrollDrafts(year, month)
  } catch (e) {
    console.error('[payroll generate-monthly] generation failed:', e)
    return NextResponse.json({ error: t('payrollGenerate.generationFailed') }, { status: 500 })
  }

  const generated = result.kind === 'ok' ? result.generated : 0

  // T71: notify affected employees via Teams that their payslip is ready.
  // Notification sending must never break payroll generation — guard everything.
  let notified = 0
  let notifyFailed = 0
  try {
    if (generated > 0) {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const service = await createServiceClient()
      const { data: records } = await service
        .from('payroll_records')
        .select('user_id')
        .eq('year', year)
        .eq('month', month)
      const userIds = Array.from(new Set((records ?? []).map(r => r.user_id)))
      if (userIds.length > 0) {
        const { data: recipients } = await service
          .from('users')
          .select('id, language')
          .in('id', userIds)
        const monthLabel = `${year}-${String(month).padStart(2, '0')}`
        // Build each message in the recipient's language (not the request cookie locale).
        // teamsText uses createTranslator — getTranslations({ locale }) is ignored by
        // src/i18n/request.ts and would fall back to the request cookie locale.
        const messages = (recipients ?? []).map(u => ({
          userId: u.id,
          text: teamsText(u.language, 'payslipReady', { month: monthLabel }),
        }))
        // sendProactiveMessages never throws (per-item error isolation in the lib)
        ;({ sent: notified, failed: notifyFailed } = await sendProactiveMessages(messages))
      }
    }
  } catch (e) {
    console.error('[payroll generate-monthly] Teams notification error:', e)
  }

  // 輸出維持與舊版（轉發 calculate 回應）等價：
  // 有符合資格的員工 → generated + total；查無員工 → 只有 generated: 0。
  return NextResponse.json({
    data: {
      generated,
      ...(result.kind === 'ok' ? { total: result.total } : {}),
      year,
      month,
      notified,
      notifyFailed,
      message: t('payrollGenerate.draftGenerated', { year, month }),
    },
  })
}
