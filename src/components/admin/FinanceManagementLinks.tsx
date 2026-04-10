'use client'

import Link from 'next/link'
import { ExternalLink, ClipboardList, AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  editable: boolean
}

export function FinanceManagementLinks({ editable }: Props) {
  const t = useTranslations('admin.financeSettings')

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('managementSection')}</h3>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        <Link
          href="/admin/insurance-brackets"
          className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
        >
          <ClipboardList size={16} className="text-slate-400 shrink-0" />
          <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{t('insuranceBracketsLink')}</span>
          <ExternalLink size={14} className="text-slate-300 group-hover:text-slate-500 dark:group-hover:text-slate-300 transition-colors" />
        </Link>
        <Link
          href="/admin/payroll/anomalies"
          className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
        >
          <AlertCircle size={16} className="text-slate-400 shrink-0" />
          <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{t('payrollAnomaliesLink')}</span>
          <ExternalLink size={14} className="text-slate-300 group-hover:text-slate-500 dark:group-hover:text-slate-300 transition-colors" />
        </Link>
      </div>
    </div>
  )
}
