'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/StatusBadge'
import { Search, FileText, AlertTriangle } from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'

const DOC_TYPE_LABELS: Record<string, string> = {
  NDA: '保密協議', MOU: '合作備忘錄', CONTRACT: '合約', AMEND: '合約修正',
}

interface Props {
  companies: any[]
  currentUser: any
  canApprove: boolean
}

export function ContractsClient({ companies, currentUser, canApprove }: Props) {
  const router = useRouter()
  const [contracts, setContracts] = useState<any[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCompany, setFilterCompany] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchContracts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ folder: 'contracts', page: String(page) })
    if (search) params.set('search', search)
    if (filterType) params.set('doc_type', filterType)
    if (filterStatus) params.set('status', filterStatus)
    if (filterCompany) params.set('company_id', filterCompany)

    const res = await fetch(`/api/documents?${params}`)
    const { data, count } = await res.json()
    setContracts(data ?? [])
    setCount(count ?? 0)
    setLoading(false)
  }, [page, search, filterType, filterStatus, filterCompany])

  useEffect(() => { fetchContracts() }, [fetchContracts])

  const PAGE_SIZE = 20
  const totalPages = Math.ceil(count / PAGE_SIZE)

  const expiryWarning = (expiresAt: string | null) => {
    if (!expiresAt) return null
    const days = differenceInDays(parseISO(expiresAt), new Date())
    if (days < 0) return 'expired'
    if (days <= 30) return 'warning'
    return null
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="搜尋合約名稱..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={v => { setFilterType(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="所有類型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">所有類型</SelectItem>
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="所有狀態" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">所有狀態</SelectItem>
            <SelectItem value="pending">待審核</SelectItem>
            <SelectItem value="approved">已核准</SelectItem>
            <SelectItem value="rejected">已退回</SelectItem>
            <SelectItem value="archived">已封存</SelectItem>
            <SelectItem value="expired">已到期</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCompany} onValueChange={v => { setFilterCompany(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="所有公司" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">所有公司</SelectItem>
            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800">
              <TableHead>合約名稱</TableHead>
              <TableHead>類型</TableHead>
              <TableHead>公司</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>到期日</TableHead>
              <TableHead>上傳者</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">載入中...</TableCell></TableRow>
            ) : contracts.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">無資料</TableCell></TableRow>
            ) : contracts.map(doc => {
              const warn = expiryWarning(doc.expires_at)
              return (
                <TableRow
                  key={doc.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => router.push(`/documents/${doc.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-slate-400 shrink-0" />
                      <span className="font-medium text-sm truncate max-w-[220px]">{doc.title}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</Badge></TableCell>
                  <TableCell className="text-sm text-slate-500">{doc.company?.name ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={doc.status} /></TableCell>
                  <TableCell>
                    {doc.expires_at ? (
                      <div className="flex items-center gap-1">
                        {warn && <AlertTriangle size={13} className={warn === 'expired' ? 'text-red-500' : 'text-amber-500'} />}
                        <span className={`text-sm ${warn === 'expired' ? 'text-red-600 dark:text-red-400' : warn === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>
                          {doc.expires_at}
                        </span>
                      </div>
                    ) : <span className="text-slate-400">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">{doc.uploaded_by_user?.display_name ?? '—'}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>共 {count} 筆</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="min-h-[36px]">上一頁</Button>
            <span>{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="min-h-[36px]">下一頁</Button>
          </div>
        </div>
      )}
    </>
  )
}
