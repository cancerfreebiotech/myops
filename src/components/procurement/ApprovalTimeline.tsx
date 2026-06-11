'use client'

import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { CheckCircle2, XCircle, Clock, Circle, MinusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { APPROVAL_FLOWS } from '@/lib/procurement/approval-flows'
import type { DocType } from '@/lib/procurement/doc-types'

// Shared approval timeline for all procurement documents.
// Renders the resolved steps from procurement_approval_steps with
// pending / current / approved / rejected / skipped visuals.

export type TimelineStepStatus = 'pending' | 'current' | 'approved' | 'rejected' | 'skipped'

export interface TimelineStep {
  step_no: number
  approver_kind: 'job_role' | 'manager_of' | 'doc_field' | 'anyone'
  approver_value: string | null
  resolved_user_name: string | null
  status: TimelineStepStatus
  acted_by_name: string | null
  acted_at: string | null
  comment: string | null
}

const STEP_ICON: Record<TimelineStepStatus, typeof Circle> = {
  pending: Circle,
  current: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  skipped: MinusCircle,
}

const ICON_STYLE: Record<TimelineStepStatus, string> = {
  pending: 'text-slate-300 dark:text-slate-600',
  current: 'text-blue-600 dark:text-blue-400',
  approved: 'text-green-600 dark:text-green-400',
  rejected: 'text-red-600 dark:text-red-400',
  skipped: 'text-slate-400 dark:text-slate-500',
}

const BADGE_STYLE: Record<TimelineStepStatus, string> = {
  pending: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  current: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  approved: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  rejected: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  skipped: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
}

interface Props {
  docType: DocType
  steps: TimelineStep[]
}

export function ApprovalTimeline({ docType, steps }: Props) {
  const t = useTranslations('procurement.approval')
  const flow = APPROVAL_FLOWS[docType]

  if (steps.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('timelineTitle')}</h3>
        <p className="text-sm text-slate-400">{t('notSubmitted')}</p>
      </div>
    )
  }

  const approverLabel = (step: TimelineStep): string => {
    if (step.resolved_user_name) return step.resolved_user_name
    switch (step.approver_kind) {
      case 'job_role':
        return step.approver_value ? t(`roles.${step.approver_value}` as Parameters<typeof t>[0]) : '—'
      case 'manager_of':
        return t('roles.manager')
      case 'anyone':
        return t('roles.anyone')
      default:
        return '—'
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{t('timelineTitle')}</h3>
      <ol className="space-y-0">
        {steps.map((step, i) => {
          const Icon = STEP_ICON[step.status]
          const flowStep = flow[step.step_no - 1]
          const stepName = flowStep ? t(`steps.${flowStep.name}` as Parameters<typeof t>[0]) : t('stepFallback', { no: step.step_no })
          const isLast = i === steps.length - 1
          return (
            <li key={step.step_no} className="relative flex gap-3 pb-5 last:pb-0">
              {!isLast && (
                <span aria-hidden className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
              )}
              <Icon size={24} className={cn('relative shrink-0 mt-0.5', ICON_STYLE[step.status])} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {t('stepLabel', { no: step.step_no })} · {stepName}
                  </span>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium', BADGE_STYLE[step.status])}>
                    {t(`stepStatus.${step.status}` as Parameters<typeof t>[0])}
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('approverLine', { name: approverLabel(step) })}
                </p>
                {step.acted_by_name && step.acted_at && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {step.acted_by_name} · {format(new Date(step.acted_at), 'yyyy-MM-dd HH:mm')}
                  </p>
                )}
                {step.comment && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 rounded-md bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 px-3 py-2">
                    {step.comment}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
