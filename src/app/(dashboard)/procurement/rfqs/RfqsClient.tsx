'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Send, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { DOC_STATUSES, type DocStatus } from '@/lib/procurement/doc-types'
import { useTableSort, usePagination, SortableHeader, TableSearch, TablePagination } from '@/components/procurement/table-tools'
import { RfqForm, RfqStatusBadge, one, type RfqListRow, type UserOption } from './shared'

// 詢價單 list: server-side status filter + keyword search (debounced ?q=
// against the whole table, plus an instant client-side filter of loaded rows) /
// sortable headers / pagination. Create dialog (sectioned form) + quick 送簽
// on draft rows. Row click navigates to the detail page.

const ALL = '__all'

interface Props {
  initialRfqs: RfqListRow[]
  users: UserOption[]
  meId: string
}

export function RfqsClient({ initialRfqs, users, meId }: Props) {
  const router = useRouter()
  const t = useTranslations('procurement.rfqs')
  const tc = useTranslations('common')

  const [rows, setRows] = useState<RfqListRow[]>(initialRfqs)
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [search, setSearch] = useState('')
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  // create dialog
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const fetchSeq = useRef(0)
  const refreshList = useCallback(async (status: string, q: string) => {
    const seq = ++fetchSeq.current
    const params = new URLSearchParams()
    if (status !== ALL) params.set('status', status)
    if (q.trim()) params.set('q', q.trim())
    const qs = params.toString()
    const res = await fetch(`/api/procurement/rfqs${qs ? `?${qs}` : ''}`)
    const { data, error } = await res.json()
    if (seq !== fetchSeq.current) return // a newer request superseded this one
    if (error) { toast.error(error); return }
    setRows(data ?? [])
  }, [])

  const onStatusChange = (value: string) => setStatusFilter(value)

  // Debounced server-side ?q= search so keywords match the whole table, not
  // just the rows already loaded (list queries are capped at 200 rows).
  const skipInitialFetch = useRef(true)
  useEffect(() => {
    if (skipInitialFetch.current) { skipInitialFetch.current = false; return }
    const handle = setTimeout(() => { refreshList(statusFilter, search) }, 300)
    return () => clearTimeout(handle)
  }, [statusFilter, search, refreshList])

  // Flatten nested/derived display values so search + sort work on plain keys
  const enriched = useMemo(() => rows.map(r => ({
    ...r,
    inquirer_name: one(r.inquirer)?.display_name ?? null,
    status_label: t(`statusLabels.${r.status}` as Parameters<typeof t>[0]),
    created_date: format(new Date(r.created_at), 'yyyy-MM-dd'),
  })), [rows, t])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return enriched
    return enriched.filter(r =>
      [r.doc_no, r.request_date, r.requesting_department, r.department, r.inquirer_name, r.status_label, r.created_date]
        .some(v => String(v ?? '').toLowerCase().includes(q)))
  }, [enriched, search])

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, 'created_at', 'desc')
  const { pageRows, page, setPage, totalPages, total } = usePagination(sorted)

  const openCreate = () => {
    setForm({
      request_date: format(new Date(), 'yyyy-MM-dd'),
      requester_id: meId,
    })
    setFormOpen(true)
  }

  const handleCreate = async () => {
    setSaving(true)
    const res = await fetch('/api/procurement/rfqs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const { data, error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    toast.success(t('created'))
    setFormOpen(false)
    router.push(`/procurement/rfqs/${data.id}`)
  }

  const handleSubmitForApproval = async (id: string) => {
    setSubmittingId(id)
    const res = await fetch(`/api/procurement/approvals/rfq/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    })
    const { error } = await res.json()
    setSubmittingId(null)
    if (error) { toast.error(error); return }
    toast.success(t('submitted'))
    refreshList(statusFilter, search)
  }

  return (
    <div className="space-y-4">
      {/* Filters + create */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={v => onStatusChange(v ?? ALL)}>
            <SelectTrigger className="min-h-[44px] w-[160px] text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filterAllStatuses')}</SelectItem>
              {DOC_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{t(`statusLabels.${s}` as Parameters<typeof t>[0])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TableSearch value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        </div>
        <Button onClick={openCreate} className="min-h-[44px] cursor-pointer">
          <Plus size={16} />
          {t('newRfq')}
        </Button>
      </div>

      {/* List */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <SortableHeader label={t('docNo')} sortKey="doc_no" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('fields.request_date')} sortKey="request_date" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('fields.requesting_department')} sortKey="requesting_department" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('fields.inquirer_id')} sortKey="inquirer_name" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('statusColumn')} sortKey="status_label" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('prCount')} sortKey="pr_count" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('createdAt')} sortKey="created_at" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-400">
                  {search.trim() ? tc('noData') : t('noRecords')}
                </td>
              </tr>
            ) : pageRows.map(r => (
              <tr
                key={r.id}
                onClick={() => router.push(`/procurement/rfqs/${r.id}`)}
                className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.doc_no ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.request_date ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.requesting_department ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.inquirer_name ?? '—'}</td>
                <td className="px-4 py-3"><RfqStatusBadge status={r.status as DocStatus} /></td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums">{r.pr_count ?? 0}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.created_date}</td>
                <td className="px-4 py-3 text-right">
                  {r.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={submittingId === r.id}
                      onClick={e => { e.stopPropagation(); handleSubmitForApproval(r.id) }}
                      className="min-h-[36px] cursor-pointer"
                    >
                      {submittingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {t('submitForApproval')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      {/* Create dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('newRfq')}</DialogTitle>
          </DialogHeader>
          <RfqForm
            value={form}
            onChange={(field, value) => setForm(prev => ({ ...prev, [field]: value }))}
            users={users}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={saving} className="min-h-[44px] cursor-pointer">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
