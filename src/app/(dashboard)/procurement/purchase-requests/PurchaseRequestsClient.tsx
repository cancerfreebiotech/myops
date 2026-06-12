'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { DocStatus } from '@/lib/procurement/doc-types'
import { useTableSort, usePagination, SortableHeader, TableSearch, TablePagination } from '@/components/procurement/table-tools'

// 請採購單 list — server-side status filter + keyword search (debounced ?q=
// against the whole table, plus an instant client-side filter of loaded rows) /
// sortable headers / pagination; rows open the [id] detail page.
// 新增 creates an empty draft and navigates straight to it.

interface NamedRef { id: string; display_name: string | null }
type MaybeArray<T> = T | T[] | null

function one<T>(v: MaybeArray<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export interface PurchaseRequestRow {
  id: string
  doc_no: string | null
  status: DocStatus
  current_step: number | null
  vendor_name: string | null
  total_amount: number | null
  purchase_date: string | null
  urgency: string | null
  fulfillment_status: string | null
  gr_count: number | null
  deposit_request_count: number | null
  created_at: string
  created_by: string | null
  purchaser: MaybeArray<NamedRef>
  created_by_user: MaybeArray<NamedRef>
}

const STATUS_STYLE: Record<DocStatus, string> = {
  draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  in_approval: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
  approved: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  rejected: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  voided: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
}

export function PrStatusBadge({ status }: { status: DocStatus }) {
  const t = useTranslations('procurement.purchaseRequests')
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap', STATUS_STYLE[status])}>
      {t(`statusLabels.${status}` as Parameters<typeof t>[0])}
    </span>
  )
}

export function formatAmount(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `NT$ ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

interface Props {
  initialRows: PurchaseRequestRow[]
}

export function PurchaseRequestsClient({ initialRows }: Props) {
  const t = useTranslations('procurement.purchaseRequests')
  const tc = useTranslations('common')
  const router = useRouter()
  const [rows, setRows] = useState<PurchaseRequestRow[]>(initialRows)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchSeq = useRef(0)
  const refresh = useCallback(async (status: string, q: string) => {
    const seq = ++fetchSeq.current
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (q.trim()) params.set('q', q.trim())
    const res = await fetch(`/api/procurement/purchase-requests?${params.toString()}`)
    const { data, error } = await res.json()
    if (seq !== fetchSeq.current) return // a newer request superseded this one
    if (error) { toast.error(error); return }
    setRows(data ?? [])
  }, [])

  const handleStatusChange = (value: string) => setStatusFilter(value)

  // Debounced server-side ?q= search so keywords match the whole table, not
  // just the rows already loaded (list queries are capped at 200 rows).
  const skipInitialFetch = useRef(true)
  useEffect(() => {
    if (skipInitialFetch.current) { skipInitialFetch.current = false; return }
    const handle = setTimeout(() => { refresh(statusFilter, search) }, 300)
    return () => clearTimeout(handle)
  }, [statusFilter, search, refresh])

  // Flatten nested/derived display values so search + sort work on plain keys
  const enriched = useMemo(() => rows.map(r => ({
    ...r,
    purchaser_name: (one(r.purchaser) ?? one(r.created_by_user))?.display_name ?? null,
    status_label: t(`statusLabels.${r.status}` as Parameters<typeof t>[0]),
    created_date: format(new Date(r.created_at), 'yyyy-MM-dd'),
  })), [rows, t])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return enriched
    return enriched.filter(r =>
      [r.doc_no, r.vendor_name, formatAmount(r.total_amount), r.status_label, r.purchaser_name, r.purchase_date, r.created_date]
        .some(v => String(v ?? '').toLowerCase().includes(q)))
  }, [enriched, search])

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, 'created_at', 'desc')
  const { pageRows, page, setPage, totalPages, total } = usePagination(sorted)

  const handleCreate = async () => {
    setCreating(true)
    const res = await fetch('/api/procurement/purchase-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchase_date: format(new Date(), 'yyyy-MM-dd') }),
    })
    const { data, error } = await res.json()
    setCreating(false)
    if (error) { toast.error(error); return }
    toast.success(t('created'))
    router.push(`/procurement/purchase-requests/${data.id}`)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={v => handleStatusChange(v ?? '')}>
            <SelectTrigger className="min-h-[44px] w-[160px]">
              <SelectValue placeholder={t('filterAll')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('filterAll')}</SelectItem>
              {(['draft', 'in_approval', 'approved', 'rejected', 'voided'] as const).map(s => (
                <SelectItem key={s} value={s}>{t(`statusLabels.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TableSearch value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        </div>
        <Button onClick={handleCreate} disabled={creating} className="min-h-[44px] cursor-pointer">
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {t('newButton')}
        </Button>
      </div>

      {/* List */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <SortableHeader label={t('list.docNo')} sortKey="doc_no" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('list.vendor')} sortKey="vendor_name" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('list.totalAmount')} sortKey="total_amount" currentKey={sortKey} dir={sortDir} onSort={toggleSort} className="[&>button]:justify-end" />
              <SortableHeader label={t('list.statusColumn')} sortKey="status_label" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('list.purchaser')} sortKey="purchaser_name" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('list.purchaseDate')} sortKey="purchase_date" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('list.createdAt')} sortKey="created_at" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-400">
                  {search.trim() ? tc('noData') : t('list.noRecords')}
                </td>
              </tr>
            ) : pageRows.map(r => (
              <tr
                key={r.id}
                onClick={() => router.push(`/procurement/purchase-requests/${r.id}`)}
                className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.doc_no ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.vendor_name ?? '—'}</td>
                <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">{formatAmount(r.total_amount)}</td>
                <td className="px-4 py-3"><PrStatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.purchaser_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.purchase_date ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.created_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </div>
  )
}
