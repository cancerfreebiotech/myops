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

/** Map status to common.* i18n key, or a hardcoded fallback for statuses without translation keys */
const STATUS_LABEL: Record<string, { key: string } | { fallback: string }> = {
  pending:           { key: 'pending' },
  approved:          { key: 'approved' },
  rejected:          { key: 'rejected' },
  cancelled:         { key: 'cancelled' },
  draft:             { key: 'draft' },
  paid:              { key: 'paid' },
  archived:          { fallback: '已封存' },
  expired:           { fallback: '已到期' },
  open:              { fallback: '待處理' },
  in_progress:       { fallback: '處理中' },
  done:              { fallback: '已完成' },
  hr_reviewed:       { fallback: 'HR 已審' },
  finance_confirmed: { fallback: '財務確認' },
  coo_approved:      { fallback: '營運長核准' },
  lead_approved:     { fallback: '負責人核准' },
  urgent:            { fallback: '緊急' },
}

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('common')
  const style = STATUS_STYLE[status] ?? 'bg-slate-50 text-slate-600 border-slate-200'
  const entry = STATUS_LABEL[status]
  const label = entry
    ? ('key' in entry ? t(entry.key) : entry.fallback)
    : status
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium',
      style
    )}>
      {label}
    </span>
  )
}
