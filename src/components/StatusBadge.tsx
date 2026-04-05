'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<string, string> = {
  pending:           'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
  approved:          'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  rejected:          'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  archived:          'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  expired:           'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  draft:             'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  open:              'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  in_progress:       'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
  done:              'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  cancelled:         'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
  paid:              'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  hr_reviewed:       'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  finance_confirmed: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  coo_approved:      'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800',
  lead_approved:     'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  urgent:            'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800',
}

/** Map status to common.* i18n key */
const STATUS_KEY: Record<string, string> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
  draft: 'draft',
  paid: 'paid',
  archived: 'archived',
  expired: 'expired',
  open: 'open',
  in_progress: 'in_progress',
  done: 'done',
  hr_reviewed: 'hr_reviewed',
  finance_confirmed: 'finance_confirmed',
  coo_approved: 'coo_approved',
  lead_approved: 'lead_approved',
  urgent: 'urgent',
}

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('common')
  const style = STATUS_STYLE[status] ?? 'bg-slate-50 text-slate-600 border-slate-200'
  const key = STATUS_KEY[status]
  const label = key ? t(key) : status
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium',
      style
    )}>
      {label}
    </span>
  )
}
