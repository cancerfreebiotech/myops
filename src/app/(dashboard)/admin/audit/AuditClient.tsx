'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const ACTION_LABELS: Record<string, string> = {
  upload: '上傳', approve: '核准', reject: '退回', archive: '封存',
  publish: '發佈', translate: 'AI 翻譯', confirm: '確認閱讀',
}
const ACTION_COLORS: Record<string, string> = {
  approve: 'bg-green-50 text-green-700 border-green-200',
  reject: 'bg-red-50 text-red-700 border-red-200',
  publish: 'bg-blue-50 text-blue-700 border-blue-200',
  upload: 'bg-slate-50 text-slate-600 border-slate-200',
  archive: 'bg-slate-50 text-slate-600 border-slate-200',
  translate: 'bg-purple-50 text-purple-700 border-purple-200',
  confirm: 'bg-green-50 text-green-700 border-green-200',
}

export function AuditClient() {
  const [logs, setLogs] = useState<any[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (search) params.set('search', search)
    if (filterAction) params.set('action', filterAction)
    const res = await fetch(`/api/admin/audit?${params}`)
    const { data, count } = await res.json()
    setLogs(data ?? [])
    setCount(count ?? 0)
    setLoading(false)
  }, [page, search, filterAction])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const PAGE_SIZE = 50
  const totalPages = Math.ceil(count / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="搜尋文件標題或操作人..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={filterAction} onValueChange={v => { setFilterAction(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="所有操作" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">所有操作</SelectItem>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-400 ml-auto">共 {count} 筆</span>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">時間</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">操作人</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">操作</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">文件</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">備註</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400">載入中...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400">無紀錄</td></tr>
            ) : logs.map((log: any) => (
              <tr key={log.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {format(parseISO(log.created_at), 'MM/dd HH:mm')}
                </td>
                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                  {log.user?.display_name ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium ${ACTION_COLORS[log.action] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                  {log.document?.title ?? log.detail?.title ?? log.doc_id?.slice(0, 8) ?? '—'}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {log.detail?.reason ?? log.detail?.provider ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>第 {page} 頁，共 {count} 筆</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="min-h-[36px]">上一頁</Button>
            <span>{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="min-h-[36px]">下一頁</Button>
          </div>
        </div>
      )}
    </div>
  )
}
