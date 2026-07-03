import { createServiceClient } from '@/lib/supabase/server'
import { answerPolicyQuestion } from '@/lib/policy-qa'
import { getFeatureFlags } from '@/lib/feature-flags'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { teamsText } from '@/lib/teams-i18n'
import { JOB_ROLE_DEFAULT_FEATURES } from '@/lib/job-role-features'
import type { JobRole } from '@/types'

// Bot-facing query endpoint (T8). Called by Dr.Ave (NOT a user session) when a
// user sends a free-text command to DrAva in Teams. Authenticated with the
// shared Bearer ${BOT_GATEWAY_TOKEN}; the asking user is identified by `email`.
//
// POST { email, command } → { text }
//   text is localized in the asking user's own language (teamsMessages namespace).
// Supported commands (loose zh/en keyword match):
//   我的待簽 / pending  → count of approval steps currently awaiting this user
//   請假    / leave    → remaining leave days by leave type
//   薪資    / payroll  → this month's payroll status

type Lang = string | null | undefined

interface UserRow {
  id: string
  job_role: string
  granted_features: string[] | null
  language: string | null
}

interface StepRow {
  approver_kind: 'job_role' | 'manager_of' | 'doc_field' | 'anyone' | string
  approver_value: string | null
  resolved_user_id: string | null
}

const PENDING_KEYWORDS = ['待簽', '待簽核', '待審', 'pending', 'approval', 'approvals', 'todo']
const LEAVE_KEYWORDS = ['請假', '假期', '休假', '特休', 'leave', 'vacation', 'pto']
const PAYROLL_KEYWORDS = ['薪資', '薪水', '工資', '薪', 'payroll', 'salary', 'payslip']

function matches(command: string, keywords: string[]): boolean {
  const c = command.toLowerCase()
  return keywords.some(k => c.includes(k.toLowerCase()))
}

function holdsFeature(user: Pick<UserRow, 'job_role' | 'granted_features'>, feature: string): boolean {
  const defaults = JOB_ROLE_DEFAULT_FEATURES[user.job_role as JobRole] ?? []
  return defaults.includes(feature) || (user.granted_features ?? []).includes(feature)
}

/** Mirror of approval-engine.canActOnStep (without admin blanket, role-agnostic). */
function canActOnStep(user: UserRow, step: StepRow): boolean {
  if (step.resolved_user_id && step.resolved_user_id === user.id) return true
  switch (step.approver_kind) {
    case 'job_role':
      return user.job_role === step.approver_value
    case 'anyone':
    case 'manager_of':
      return !!step.approver_value && holdsFeature(user, step.approver_value)
    default:
      return false
  }
}

async function countPending(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  user: UserRow,
): Promise<number> {
  const { data } = await service
    .from('procurement_approval_steps')
    .select('approver_kind, approver_value, resolved_user_id, status')
    .eq('status', 'current')
  const steps = (data as (StepRow & { status: string })[] | null) ?? []
  return steps.filter(s => canActOnStep(user, s)).length
}

async function leaveText(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  user: UserRow,
  lang: Lang,
): Promise<string> {
  const year = new Date().getFullYear()
  const { data } = await service
    .from('leave_balances')
    .select('total_days, used_days, leave_type:leave_types(name_zh, name_en, name_ja)')
    .eq('user_id', user.id)
    .eq('year', year)
  const rows = (data as
    | { total_days: number; used_days: number | null; leave_type: { name_zh: string; name_en: string; name_ja: string } | null }[]
    | null) ?? []

  if (rows.length === 0) {
    return teamsText(lang, 'botQueryLeaveNone')
  }

  const nameKey = lang === 'en' ? 'name_en' : lang === 'ja' ? 'name_ja' : 'name_zh'
  const lines = rows.map(r => {
    const remaining = Number(r.total_days) - Number(r.used_days ?? 0)
    const name = (r.leave_type?.[nameKey as 'name_zh'] as string | undefined) ?? '-'
    return teamsText(lang, 'botQueryLeaveLine', { type: name, remaining })
  })
  return `${teamsText(lang, 'botQueryLeaveHeader')}\n${lines.join('\n')}`
}

async function payrollText(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  user: UserRow,
  lang: Lang,
): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const { data } = await service
    .from('payroll_records')
    .select('status, net_pay')
    .eq('user_id', user.id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()

  if (!data) {
    return teamsText(lang, 'botQueryPayrollNone', { year, month })
  }
  const statusLabel = teamsText(
    lang,
    `botQueryPayrollStatus_${data.status}` as Parameters<typeof teamsText>[1],
  )
  return teamsText(lang, 'botQueryPayroll', { year, month, status: statusLabel })
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')

  const token = process.env.BOT_GATEWAY_TOKEN
  const authHeader = request.headers.get('authorization')
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  }

  let body: { email?: string; command?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const { email, command } = body
  if (!email || !command) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const service = await createServiceClient()
  const { data: userRow } = await service
    .from('users')
    .select('id, job_role, granted_features, language, is_active')
    .eq('email', email)
    .maybeSingle()
  if (!userRow || (userRow as { is_active?: boolean }).is_active === false) {
    return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  }
  const user = userRow as UserRow
  const lang = user.language

  try {
    let text: string
    if (matches(command, PENDING_KEYWORDS)) {
      const count = await countPending(service, user)
      text = teamsText(lang, 'botQueryPending', { count })
    } else if (matches(command, LEAVE_KEYWORDS)) {
      text = await leaveText(service, user, lang)
    } else if (matches(command, PAYROLL_KEYWORDS)) {
      text = await payrollText(service, user, lang)
    } else {
      // 政策問答 fallback（flag `ask_ai` 開啟時）
      const flags = await getFeatureFlags()
      if (flags.ask_ai) {
        const result = await answerPolicyQuestion(command, lang ?? 'zh-TW')
        text = 'error' in result ? teamsText(lang, 'botQueryUnknown') : result.answer
      } else {
        text = teamsText(lang, 'botQueryUnknown')
      }
    }
    return NextResponse.json({ text })
  } catch (e) {
    console.error('[bot/query] unexpected error:', e)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
}
