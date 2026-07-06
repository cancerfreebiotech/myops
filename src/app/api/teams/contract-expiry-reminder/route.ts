import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { sendProactiveMessages } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'
import { taipeiToday } from '@/lib/taipei-date'

// B1: Contract expiry reminder — called by cron daily at 01:00 UTC (09:00 Asia/Taipei).
// Finds approved contracts (CONTRACT/NDA/MOU/AMEND) whose expires_at is exactly
// contract_reminder_days_first (90) or contract_reminder_days_second (30) days
// from the Taipei "today", and notifies every active user who can approve
// contracts (role='admin' or granted_features includes 'approve_contract').

type ExpiringDoc = {
  id: string
  title: string
  title_en: string | null
  title_ja: string | null
  expires_at: string
  company: { name: string } | { name: string }[] | null
}

/** Add n days to a YYYY-MM-DD date string using UTC arithmetic (DST-safe). */
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Parse a system_settings numeric value, falling back to a default. */
function parseDays(value: string | null | undefined, fallback: number): number {
  const n = Number.parseInt((value ?? '').trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Pick the recipient-localized title. */
function localizedTitle(doc: ExpiringDoc, language: string | null | undefined): string {
  if (language === 'en') return doc.title_en || doc.title
  if (language === 'ja') return doc.title_ja || doc.title
  return doc.title
}

/** company join may come back as object or single-element array depending on typing. */
function companyName(doc: ExpiringDoc): string | null {
  const c = doc.company
  if (!c) return null
  if (Array.isArray(c)) return c[0]?.name ?? null
  return c.name ?? null
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  // Verify cron or admin (fail closed: cron path requires CRON_SECRET to be configured)
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isCron) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
    const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (data?.role !== 'admin') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const service = await createServiceClient()

  // 1) Read reminder-day thresholds from system_settings (text values).
  const { data: settingsRows } = await service
    .from('system_settings')
    .select('key, value')
    .in('key', ['contract_reminder_days_first', 'contract_reminder_days_second'])

  const settings = Object.fromEntries((settingsRows ?? []).map(r => [r.key, r.value])) as Record<string, string>
  const firstDays = parseDays(settings.contract_reminder_days_first, 90)
  const secondDays = parseDays(settings.contract_reminder_days_second, 30)

  const today = taipeiToday()
  const targetFirst = addDays(today, firstDays)
  const targetSecond = addDays(today, secondDays)
  // Dedupe in case first === second (avoids duplicate lines).
  const targetDates = Array.from(new Set([targetFirst, targetSecond]))

  // 2) Find approved contracts expiring exactly on a target date.
  const { data: docsRaw } = await service
    .from('documents')
    .select('id, title, title_en, title_ja, expires_at, company:companies(name)')
    .eq('status', 'approved')
    .in('doc_type', ['CONTRACT', 'NDA', 'MOU', 'AMEND'])
    .in('expires_at', targetDates)
    .is('deleted_at', null)

  const docs = (docsRaw ?? []) as unknown as ExpiringDoc[]
  if (!docs.length) return NextResponse.json({ data: { sent: 0, failed: 0, total: 0, docs: 0 } })

  // 3) Determine recipients: active users who can approve contracts.
  const { data: users } = await service
    .from('users')
    .select('id, display_name, language, role, granted_features')
    .eq('is_active', true)

  const recipients = (users ?? []).filter(u =>
    u.role === 'admin' || (u.granted_features as string[] ?? []).includes('approve_contract'),
  )
  if (!recipients.length) return NextResponse.json({ data: { sent: 0, failed: 0, total: 0, docs: docs.length } })

  // 4) Build one message per recipient in their own language.
  const messages: { userId: string; text: string }[] = []
  for (const u of recipients) {
    const lines: string[] = [teamsText(u.language, 'contractExpiryHeader', { name: u.display_name })]
    for (const doc of docs) {
      const days = doc.expires_at === targetFirst ? firstDays : secondDays
      const title = localizedTitle(doc, u.language)
      const company = companyName(doc)
      lines.push(
        company
          ? teamsText(u.language, 'contractExpiryLine', { title, company, days, date: doc.expires_at })
          : teamsText(u.language, 'contractExpiryLineNoCompany', { title, days, date: doc.expires_at }),
      )
    }
    lines.push(teamsText(u.language, 'contractExpiryFooter'))
    messages.push({ userId: u.id, text: lines.join('\n') })
  }

  // 5) Send (never throws — per-item isolation in the lib; guard anyway).
  let sent = 0
  let failed = 0
  try {
    ;({ sent, failed } = await sendProactiveMessages(messages))
  } catch (e) {
    console.error('[Contract Expiry Reminder] batch send error:', e)
    failed = messages.length - sent
  }

  return NextResponse.json({ data: { sent, failed, total: messages.length, docs: docs.length } })
}

// Vercel Cron invokes via GET
export const GET = POST
