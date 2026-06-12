'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Send, Loader2, Search } from 'lucide-react'
import { format } from 'date-fns'
import { DOC_STATUSES, type DocStatus } from '@/lib/procurement/doc-types'
import { RfqForm, RfqStatusBadge, one, type RfqListRow, type UserOption } from './shared'

// 詢價單 list: status / keyword filters + create dialog (sectioned form) +
// quick 送簽 on draft rows. Row click navigates to the detail page.

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
  const [listLoading, setListLoading] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  // create dialog
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const refreshList = useCallback(async (status: string, q: string) => {
    setListLoading(true)
    const params = new URLSearchParams()
    if (status !== ALL) params.set('status', status)
    if (q.trim()) params.set('q', q.trim())
    const qs = params.toString()
    const res = await fetch(`/api/procurement/rfqs${qs ? `?${qs}` : ''}`)
    const { data, error } = await res.json()
    setListLoading(false)
    if (error) { toast.error(error); return }
    setRows(data ?? [])
  }, [])

  const onStatusChange = (value: string) => {
    setStatusFilter(value)
    refreshList(value, search)
  }

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
          <form
            onSubmit={e => { e.preventDefault(); refreshList(statusFilter, search) }}
            className="flex items-center gap-2"
          >
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="text-base min-h-[44px] w-[200px]"
            />
            <Button type="submit" variant="outline" disabled={listLoading} className="min-h-[44px] cursor-pointer" aria-label={tc('search')}>
              {listLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </Button>
          </form>
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
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('docNo')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('fields.request_date')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('fields.requesting_department')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('fields.inquirer_id')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('statusColumn')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('prCount')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('createdAt')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-400">
                  {t('noRecords')}
                </td>
              </tr>
            ) : rows.map(r => (
              <tr
                key={r.id}
                onClick={() => router.push(`/procurement/rfqs/${r.id}`)}
                className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.doc_no ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.request_date ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.requesting_department ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{one(r.inquirer)?.display_name ?? '—'}</td>
                <td className="px-4 py-3"><RfqStatusBadge status={r.status as DocStatus} /></td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums">{r.pr_count ?? 0}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{format(new Date(r.created_at), 'yyyy-MM-dd')}</td>
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
