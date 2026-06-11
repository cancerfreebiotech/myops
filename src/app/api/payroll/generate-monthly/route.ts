import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { sendProactiveMessages } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'

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

  // Forward to the calculate endpoint logic
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ops.cancerfree.io'
  const calcRes = await fetch(`${baseUrl}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cronSecret ? { 'Authorization': `Bearer ${cronSecret}` } : {}),
      'Cookie': request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({ year, month }),
  })

  const result = await calcRes.json()

  if (!calcRes.ok) {
    return NextResponse.json({ error: result.error ?? t('payrollGenerate.generationFailed') }, { status: 500 })
  }

  // T71: notify affected employees via Teams that their payslip is ready.
  // Notification sending must never break payroll generation — guard everything.
  let notified = 0
  let notifyFailed = 0
  try {
    if ((result.data?.generated ?? 0) > 0) {
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

  return NextResponse.json({
    data: {
      ...result.data,
      year,
      month,
      notified,
      notifyFailed,
      message: t('payrollGenerate.draftGenerated', { year, month }),
    },
  })
}
