'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, TrendingUp, CalendarDays } from 'lucide-react'
import { StatusBadge } from '@/components/StatusBadge'

export interface PayrollDetail {
  id: string
  user_id: string
  year: number
  month: number
  base_salary: number | null
  overtime_pay: number | null
  bonus: number | null
  other_income: number | null
  unpaid_leave_deduct: number | null
  labor_insurance: number | null
  health_insurance: number | null
  labor_pension_self: number | null
  other_deduction: number | null
  gross_pay: number | null
  total_deduction: number | null
  net_pay: number | null
  employer_labor_ins: number | null
  employer_health_ins: number | null
  employer_pension: number | null
  status: string
  note: string | null
  anomaly_flags: unknown
  hr_reviewed_by: string | null
  hr_reviewed_at: string | null
  finance_confirmed_by: string | null
  finance_confirmed_at: string | null
  coo_approved_by: string | null
  coo_approved_at: string | null
  paid_by: string | null
  paid_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  user?: { id: string; display_name: string | null; department?: { name: string } | { name: string }[] | null } | null
}

interface Props {
  record: PayrollDetail
  actorNames: Record<string, string | null>
  canViewPayroll: boolean
}

/**
 * null 與 0 是兩件不同的事：null＝「這一項沒有算」（手動建立的薪資單不會填保費欄位），
 * 0＝「算出來是零」（級距表沒上傳時保費真的會是 0）。混成同一個顯示會蓋掉問題，
 * 所以 null 一律顯示「—」。
 */
const money = (n: number | null) => (n == null ? '—' : `NT$ ${Number(n).toLocaleString('zh-TW')}`)

const dateTime = (iso: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') : null)

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'add' | 'sub' | 'total' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={
          tone === 'sub'
            ? 'text-sm tabular-nums text-red-500'
            : tone === 'total'
              ? 'text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100'
              : 'text-sm tabular-nums text-slate-700 dark:text-slate-300'
        }
      >
        {value}
      </span>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5">
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">{children}</div>
    </section>
  )
}

export function PayrollDetailClient({ record, actorNames, canViewPayroll }: Props) {
  const t = useTranslations('payroll')
  const dept = one(record.user?.department)

  const trail: { label: string; actor: string | null; at: string | null }[] = [
    { label: t('hrReview'), actor: record.hr_reviewed_by, at: record.hr_reviewed_at },
    { label: t('financeConfirm'), actor: record.finance_confirmed_by, at: record.finance_confirmed_at },
    { label: t('cooApprove'), actor: record.coo_approved_by, at: record.coo_approved_at },
    { label: t('confirmPay'), actor: record.paid_by, at: record.paid_at },
    { label: t('detailRejected'), actor: record.rejected_by, at: record.rejected_at },
  ].filter(s => s.at || s.actor)

  const flags = Array.isArray(record.anomaly_flags) ? (record.anomaly_flags as unknown[]) : []

  return (
    <div className="max-w-2xl space-y-4">
      <Link
        href="/payroll"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft size={14} aria-hidden /> {t('detailBack')}
      </Link>

      {/* 員工與期間 */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{record.user?.display_name ?? '—'}</p>
            <p className="text-xs text-slate-400">
              {dept?.name ?? '—'} · {t('detailPeriod', { year: record.year, month: record.month })}
            </p>
          </div>
          <StatusBadge status={record.status} />
        </div>
        {canViewPayroll && (
          <Link
            href={`/payroll/annual?year=${record.year}`}
            className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <CalendarDays size={13} aria-hidden /> {t('detailViewAnnual', { year: record.year })}
          </Link>
        )}
      </section>

      {flags.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{t('anomalies')}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-700 dark:text-amber-300">
            {flags.map((f, i) => (
              <li key={i}>{typeof f === 'string' ? f : JSON.stringify(f)}</li>
            ))}
          </ul>
        </div>
      )}

      <Section title={t('detailEarnings')}>
        <Row label={t('baseSalary')} value={money(record.base_salary)} />
        <Row label={t('overtimePay')} value={money(record.overtime_pay)} />
        <Row label={t('bonus')} value={money(record.bonus)} />
        <Row label={t('detailOtherIncome')} value={money(record.other_income)} />
        <Row label={t('grossPay')} value={money(record.gross_pay)} tone="total" />
      </Section>

      <Section title={t('detailDeductions')}>
        <Row label={t('detailUnpaidLeave')} value={money(record.unpaid_leave_deduct)} tone="sub" />
        <Row label={t('laborInsurance')} value={money(record.labor_insurance)} tone="sub" />
        <Row label={t('healthInsurance')} value={money(record.health_insurance)} tone="sub" />
        <Row label={t('laborPension')} value={money(record.labor_pension_self)} tone="sub" />
        <Row label={t('detailOtherDeduction')} value={money(record.other_deduction)} tone="sub" />
        <Row label={t('deductions')} value={money(record.total_deduction)} tone="total" />
      </Section>

      <section className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('netPay')}</span>
          <span className="text-xl font-bold tabular-nums text-blue-700 dark:text-blue-300">{money(record.net_pay)}</span>
        </div>
      </section>

      <Section title={t('detailEmployerCost')} hint={t('detailEmployerHint')}>
        <Row label={t('detailEmployerLaborIns')} value={money(record.employer_labor_ins)} />
        <Row label={t('detailEmployerHealthIns')} value={money(record.employer_health_ins)} />
        <Row label={t('detailEmployerPension')} value={money(record.employer_pension)} />
      </Section>

      {trail.length > 0 && (
        <Section title={t('detailApprovalTrail')}>
          {trail.map(s => (
            <div key={s.label} className="flex items-baseline justify-between gap-4 py-2">
              <span className="text-sm text-slate-500 dark:text-slate-400">{s.label}</span>
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {(s.actor ? actorNames[s.actor] ?? '—' : '—')}
                {dateTime(s.at) && <span className="ml-2 text-xs text-slate-400">{dateTime(s.at)}</span>}
              </span>
            </div>
          ))}
        </Section>
      )}

      {record.note && (
        <Section title={t('notes')}>
          <p className="py-2 text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">{record.note}</p>
        </Section>
      )}

      <p className="flex items-start gap-1.5 text-xs text-slate-400">
        <TrendingUp size={13} className="mt-0.5 shrink-0" aria-hidden />
        {t('detailPhaseNote')}
      </p>
    </div>
  )
}
