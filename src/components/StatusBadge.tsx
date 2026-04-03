import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:  { label: '待審核', className: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300' },
  approved: { label: '已核准', className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300' },
  rejected: { label: '已退回', className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300' },
  archived: { label: '已封存', className: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400' },
  expired:  { label: '已到期', className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300' },
  draft:    { label: '草稿',   className: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400' },
  open:     { label: '待處理', className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300' },
  in_progress: { label: '處理中', className: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300' },
  done:     { label: '已完成', className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300' },
  cancelled: { label: '已取消', className: 'bg-slate-100 text-slate-600 border-slate-300' },
  paid:     { label: '已發薪', className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300' },
  hr_reviewed: { label: 'HR 已審', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  finance_confirmed: { label: '財務確認', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  coo_approved: { label: '營運長核准', className: 'bg-purple-100 text-purple-800 border-purple-300' },
  lead_approved: { label: '負責人核准', className: 'bg-blue-100 text-blue-800 border-blue-300' },
}

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', config.className)}>
      {config.label}
    </Badge>
  )
}
