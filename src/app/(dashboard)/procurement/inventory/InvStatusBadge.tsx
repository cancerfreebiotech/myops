'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { DocStatus } from '@/lib/procurement/doc-types'
import { STATUS_STYLE } from './types'

// 入庫單／出庫單狀態徽章 — 列表頁與明細頁共用。
export function InvStatusBadge({ status }: { status: DocStatus }) {
  const t = useTranslations('procurement.inventory')
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap', STATUS_STYLE[status])}>
      {t(`statusLabels.${status}` as Parameters<typeof t>[0])}
    </span>
  )
}
