'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Loader2, HandCoins } from 'lucide-react'
import { format } from 'date-fns'
import type { DocStatus } from '@/lib/procurement/doc-types'
import { GrStatusBadge } from './StatusBadge'

// 進貨驗收單 list: table of goods receipts + 新增 dialog (optional 來源採購單號).
// Row click navigates to the [id] detail page.

interface NamedRef { id: string; display_name: string | null }
type MaybeArray<T> = T | T[] | null

function one<T>(v: MaybeArray<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export interface GoodsReceiptRow {
  id: string
  doc_no: string | null
  status: DocStatus
  current_step: number | null
  pr_id: string | null
  vendor_name: string | null
  total_amount: number | null
  has_deposit: boolean | null
  created_at: string
  created_by: string | null
  pr: MaybeArray<{ id: string; doc_no: string | null }>
  created_by_user: MaybeArray<NamedRef>
}

interface Props {
  initialRows: GoodsReceiptRow[]
}

export function GoodsReceiptsClient({ initialRows }: Props) {
  const t = useTranslations('procurement.goodsReceipts')
  const tc = useTranslations('common')
  const router = useRouter()
  const [rows, setRows] = useState<GoodsReceiptRow[]>(initialRows)

  // create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [prDocNo, setPrDocNo] = useState('')
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/procurement/goods-receipts')
    const { data, error } = await res.json()
    if (error) { toast.error(error); return }
    setRows(data ?? [])
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    const res = await fetch('/api/procurement/goods-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prDocNo.trim() ? { pr_doc_no: prDocNo.trim() } : {}),
    })
    const { data, error } = await res.json()
    setCreating(false)
    if (error) { toast.error(error); return }
    toast.success(t('created'))
    setCreateOpen(false)
    setPrDocNo('')
    refresh()
    router.push(`/procurement/goods-receipts/${data.id}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)} className="min-h-[44px] cursor-pointer">
          <Plus size={16} />
          {t('newButton')}
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colDocNo')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colSourcePr')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colVendor')}</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colTotalAmount')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colStatus')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colCreator')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colCreatedAt')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-400">
                  {t('noRecords')}
                </td>
              </tr>
            ) : rows.map(r => {
              const creator = one(r.created_by_user)
              const pr = one(r.pr)
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/procurement/goods-receipts/${r.id}`)}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {r.doc_no ?? '—'}
                      {r.has_deposit && (
                        <HandCoins size={14} className="text-amber-600 dark:text-amber-400" aria-label={t('fields.has_deposit')} />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{pr?.doc_no ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.vendor_name ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap tabular-nums">
                    {r.total_amount !== null ? r.total_amount.toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3"><GrStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{creator?.display_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{format(new Date(r.created_at), 'yyyy-MM-dd')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="gr-pr-doc-no" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('createSourcePrLabel')}
            </label>
            <Input
              id="gr-pr-doc-no"
              value={prDocNo}
              onChange={e => setPrDocNo(e.target.value)}
              placeholder={t('createSourcePrPlaceholder')}
              className="text-base"
            />
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('createHint')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="min-h-[44px] cursor-pointer">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
