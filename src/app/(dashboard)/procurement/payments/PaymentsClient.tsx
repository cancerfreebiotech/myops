'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Send, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { DocStatus, DocType } from '@/lib/procurement/doc-types'
import { useTableSort, usePagination, SortableHeader, TableSearch, TablePagination } from '@/components/procurement/table-tools'

// 請款三單 — three tabs (deposit / ap / installment payment requests):
// list + 送簽 (submit for approval); rows navigate to /procurement/payments/[kind]/[id].

export type PaymentKind = 'deposit' | 'ap' | 'installment'

export const PAYMENT_DOC_TYPE: Record<PaymentKind, DocType> = {
  deposit: 'deposit_request',
  ap: 'ap_request',
  installment: 'installment_request',
}

interface NamedRef { id: string; display_name: string | null }
interface DocRef { id: string; doc_no: string | null }
type MaybeArray<T> = T | T[] | null

function one<T>(v: MaybeArray<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

interface PaymentRowBase {
  id: string
  doc_no: string | null
  status: DocStatus
  current_step: number | null
  created_at: string
  created_by: string | null
  created_by_user: MaybeArray<NamedRef>
}

export interface DepositRow extends PaymentRowBase {
  vendor_name: string | null
  vendor_short_name: string | null
  deposit_amount: number | null
  total_amount: number | null
  remittance_deadline: string | null
  pr: MaybeArray<DocRef>
}

export interface ApRow extends PaymentRowBase {
  vendor_name: string | null
  billing_month: string | null
  total_amount: number | null
  is_installment: boolean | null
  gr: MaybeArray<DocRef>
}

export interface InstallmentRow extends PaymentRowBase {
  installment_no: number | null
  billing_month: string | null
  amount: number | null
  invoice_no: string | null
  ap: MaybeArray<DocRef>
}

type PaymentRow = DepositRow | ApRow | InstallmentRow

const STATUS_STYLE: Record<DocStatus, string> = {
  draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  in_approval: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
  approved: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  rejected: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  voided: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
}

export function PaymentStatusBadge({ status }: { status: DocStatus }) {
  const t = useTranslations('procurement.payments')
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap', STATUS_STYLE[status])}>
      {t(`statusLabels.${status}` as Parameters<typeof t>[0])}
    </span>
  )
}

export function formatAmount(value: number | null | undefined): string {
  if (value == null) return '—'
  return Number(value).toLocaleString('en-US')
}

interface Props {
  initialDeposits: DepositRow[]
  initialAps: ApRow[]
  initialInstallments: InstallmentRow[]
}

export function PaymentsClient({ initialDeposits, initialAps, initialInstallments }: Props) {
  const t = useTranslations('procurement.payments')
  const tc = useTranslations('common')
  const router = useRouter()
  const [tab, setTab] = useState<PaymentKind>('deposit')
  const [search, setSearch] = useState('')
  const [depositRows, setDepositRows] = useState<DepositRow[]>(initialDeposits)
  const [apRows, setApRows] = useState<ApRow[]>(initialAps)
  const [installmentRows, setInstallmentRows] = useState<InstallmentRow[]>(initialInstallments)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const refreshList = useCallback(async (kind: PaymentKind) => {
    const res = await fetch(`/api/procurement/payments/${kind}`)
    const { data, error } = await res.json()
    if (error) { toast.error(error); return }
    if (kind === 'deposit') setDepositRows(data ?? [])
    else if (kind === 'ap') setApRows(data ?? [])
    else setInstallmentRows(data ?? [])
  }, [])

  const handleSubmitForApproval = async (kind: PaymentKind, id: string) => {
    setSubmittingId(id)
    const res = await fetch(`/api/procurement/approvals/${PAYMENT_DOC_TYPE[kind]}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    })
    const { error } = await res.json()
    setSubmittingId(null)
    if (error) { toast.error(error); return }
    toast.success(t('submitted'))
    refreshList(kind)
  }

  const rows: PaymentRow[] = tab === 'deposit' ? depositRows : tab === 'ap' ? apRows : installmentRows

  const enriched = useMemo(() => rows.map(r => {
    let source_doc_no: string | null
    let main_label: string | null
    let amount_value: number | null
    let billing_month_value: string | null = null
    if (tab === 'deposit') {
      const d = r as DepositRow
      source_doc_no = one(d.pr)?.doc_no ?? null
      main_label = d.vendor_short_name || d.vendor_name || null
      amount_value = d.deposit_amount
    } else if (tab === 'ap') {
      const a = r as ApRow
      source_doc_no = one(a.gr)?.doc_no ?? null
      main_label = a.vendor_name
      amount_value = a.total_amount
      billing_month_value = a.billing_month
    } else {
      const i = r as InstallmentRow
      source_doc_no = one(i.ap)?.doc_no ?? null
      main_label = i.installment_no != null ? t('installmentNoValue', { no: i.installment_no }) : null
      amount_value = i.amount
      billing_month_value = i.billing_month
    }
    return {
      ...r,
      source_doc_no,
      main_label,
      amount_value,
      billing_month_value,
      status_label: t(`statusLabels.${r.status}` as Parameters<typeof t>[0]),
      creator_name: one(r.created_by_user)?.display_name ?? null,
      created_date: format(new Date(r.created_at), 'yyyy-MM-dd'),
    }
  }), [rows, tab, t])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return enriched
    return enriched.filter(r =>
      [
        r.doc_no,
        r.source_doc_no,
        r.main_label,
        r.billing_month_value,
        formatAmount(r.amount_value),
        r.status_label,
        r.creator_name,
        r.created_date,
      ].some(v => String(v ?? '').toLowerCase().includes(q)),
    )
  }, [enriched, search])

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, 'created_at', 'desc')
  const { pageRows, page, setPage, totalPages, total } = usePagination(sorted)

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {([
          { key: 'deposit' as const, label: t('tabDeposit') },
          { key: 'ap' as const, label: t('tabAp') },
          { key: 'installment' as const, label: t('tabInstallment') },
        ]).map(item => (
          <button
            key={item.key}
            onClick={() => { setTab(item.key); setSearch('') }}
            className={cn(
              'px-4 py-2 min-h-[44px] text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap',
              tab === item.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <TableSearch value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />

      {/* List */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <SortableHeader label={t('docNo')} sortKey="doc_no" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('sourceDoc')} sortKey="source_doc_no" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader
                label={tab === 'installment' ? t('installmentNo') : t('vendor')}
                sortKey="main_label"
                currentKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              {tab !== 'deposit' && (
                <SortableHeader label={t('fields.billing_month')} sortKey="billing_month_value" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              )}
              <SortableHeader label={t('amount')} sortKey="amount_value" currentKey={sortKey} dir={sortDir} onSort={toggleSort} className="[&>button]:justify-end" />
              <SortableHeader label={t('statusColumn')} sortKey="status_label" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('creator')} sortKey="creator_name" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label={t('createdAt')} sortKey="created_at" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={tab === 'deposit' ? 8 : 9} className="text-center py-10 text-slate-400">
                  {search.trim() ? tc('noData') : t('noRecords')}
                </td>
              </tr>
            ) : pageRows.map(r => {
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/procurement/payments/${tab}/${r.id}`)}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.doc_no ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.source_doc_no ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.main_label ?? '—'}</td>
                  {tab !== 'deposit' && (
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {r.billing_month_value ?? '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                    {formatAmount(r.amount_value)}
                  </td>
                  <td className="px-4 py-3"><PaymentStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.creator_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.created_date}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={submittingId === r.id}
                        onClick={e => { e.stopPropagation(); handleSubmitForApproval(tab, r.id) }}
                        className="min-h-[36px] cursor-pointer"
                      >
                        {submittingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {t('submitForApproval')}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </div>
  )
}
