'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { DocStatus } from '@/lib/procurement/doc-types'

// Shared status badge for the goods-receipt list + detail pages
// (semantic colours per design-system MASTER §2.2, dark variants included).

const STATUS_STYLE: Record<DocStatus, string> = {
  draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  in_approval: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
  approved: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  rejected: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  voided: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
}

export function GrStatusBadge({ status }: { status: DocStatus }) {
  const t = useTranslations('procurement.goodsReceipts')
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap', STATUS_STYLE[status])}>
      {t(`statusLabels.${status}` as Parameters<typeof t>[0])}
    </span>
  )
}
