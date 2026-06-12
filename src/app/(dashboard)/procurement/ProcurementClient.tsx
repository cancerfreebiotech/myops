'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  Inbox,
  Package,
  PackageCheck,
  Receipt,
  ShoppingCart,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { DOC_TYPE_META, type DocType } from '@/lib/procurement/doc-types'
import { useTableSort, usePagination, SortableHeader, TablePagination } from '@/components/procurement/table-tools'
import { cn } from '@/lib/utils'

interface InboxItem {
  doc_type: DocType
  doc_id: string
  doc_no: string
  step_no: number
  applicant: { id: string | null; display_name: string | null }
  arrived_at: string
}

/** GET /api/procurement/stats response */
interface Stats {
  vendors: number
  products: number
  rfqs: number
  purchase_requests: number
  goods_receipts: number
  inbound_orders: number
  outbound_orders: number
  payments: number
  evaluations: number
  expiring_lots: number
}

/**
 * Detail routes per document type. Phase A ships the evaluation forms only;
 * the remaining document types open in Phase B (rows shown disabled).
 */
function docDetailHref(item: InboxItem): string | null {
  switch (item.doc_type) {
    case 'vendor_evaluation':
      return `/procurement/evaluations/vendor/${item.doc_id}`
    case 'product_evaluation':
      return `/procurement/evaluations/product/${item.doc_id}`
    default:
      return null // Phase B
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // YYYY-MM-DD HH:mm (Asia/Taipei)
  return d.toLocaleString('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function ProcurementClient() {
  const t = useTranslations('procurement')
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [error, setError] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsFailed, setStatsFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadInbox = async () => {
      try {
        const res = await fetch('/api/procurement/inbox')
        if (res.status === 403) {
          // No procurement access and nothing pending — show an empty inbox
          if (!cancelled) setItems([])
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) setItems(json.data ?? [])
      } catch {
        if (!cancelled) setError(true)
      }
    }

    const loadStats = async () => {
      try {
        const res = await fetch('/api/procurement/stats')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) setStats(json.data ?? null)
      } catch {
        // Cards stay visible as plain links with an em dash instead of a count
        if (!cancelled) setStatsFailed(true)
      }
    }

    loadInbox()
    loadStats()
    return () => { cancelled = true }
  }, [])

  // Flatten nested/derived display values onto plain keys so sorting works
  const inboxRows = useMemo(() => (items ?? []).map(item => ({
    item,
    doc_no: item.doc_no,
    type_label: t(DOC_TYPE_META[item.doc_type].labelKey as Parameters<typeof t>[0]),
    applicant_name: item.applicant.display_name,
    arrived_at: item.arrived_at,
  })), [items, t])

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(inboxRows, 'arrived_at', 'desc')
  const { pageRows, page, setPage, totalPages, total } = usePagination(sorted)

  // Module cards — label keys reuse the existing per-module namespaces
  const moduleCards: { href: string; icon: LucideIcon; label: string; count: (s: Stats) => number }[] = [
    { href: '/procurement/rfqs', icon: FileSearch, label: t('docTypes.rfq'), count: s => s.rfqs },
    { href: '/procurement/purchase-requests', icon: ShoppingCart, label: t('docTypes.purchase_request'), count: s => s.purchase_requests },
    { href: '/procurement/goods-receipts', icon: PackageCheck, label: t('docTypes.goods_receipt'), count: s => s.goods_receipts },
    { href: '/procurement/inventory', icon: Warehouse, label: t('inventory.title'), count: s => s.inbound_orders + s.outbound_orders },
    { href: '/procurement/payments', icon: Receipt, label: t('payments.title'), count: s => s.payments },
    { href: '/procurement/vendors', icon: Building2, label: t('nav.vendors'), count: s => s.vendors },
    { href: '/procurement/products', icon: Package, label: t('nav.products'), count: s => s.products },
    { href: '/procurement/evaluations', icon: ClipboardCheck, label: t('nav.evaluations'), count: s => s.evaluations },
  ]

  return (
    <div className="space-y-6">
      {/* Approval inbox (我的待簽) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Inbox size={20} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t('inbox.title')}</h2>
          {items !== null && items.length > 0 && (
            <span className="ml-auto text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900 tabular-nums">
              {t('inbox.pendingCount', { count: items.length })}
            </span>
          )}
        </div>

        {error ? (
          <p className="px-4 py-8 text-sm text-red-600 dark:text-red-400 text-center" role="alert">
            {t('inbox.loadError')}
          </p>
        ) : items === null ? (
          <div className="p-4 space-y-2" aria-hidden="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-sm text-slate-500 dark:text-slate-400 text-center">{t('inbox.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <SortableHeader label={t('inbox.docNo')} sortKey="doc_no" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableHeader label={t('inbox.docType')} sortKey="type_label" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableHeader label={t('inbox.applicant')} sortKey="applicant_name" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableHeader label={t('inbox.arrivedAt')} sortKey="arrived_at" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ item, type_label: typeLabel }) => {
                  const href = docDetailHref(item)
                  return (
                    <tr
                      key={`${item.doc_type}:${item.doc_id}`}
                      className={cn(
                        'border-b border-slate-100 dark:border-slate-700/60 last:border-b-0',
                        href ? 'hover:bg-slate-50 dark:hover:bg-slate-700/40' : 'opacity-60'
                      )}
                    >
                      <td className="px-4 py-3 font-medium tabular-nums whitespace-nowrap">
                        {href ? (
                          <Link
                            href={href}
                            className="inline-flex items-center min-h-[44px] -my-3 text-blue-600 dark:text-blue-400 hover:underline focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                          >
                            {item.doc_no}
                          </Link>
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">{item.doc_no}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        <span className="inline-flex items-center gap-2">
                          {typeLabel}
                          {!href && (
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">
                              {t('inbox.phaseB')}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {item.applicant.display_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatDateTime(item.arrived_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="px-4 pb-4">
                <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Module cards */}
      <section aria-label={t('dashboard.modules')}>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
          {t('dashboard.modules')}
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {/* Expiry alert card — only when lots expire within 60 days */}
          {stats !== null && stats.expiring_lots > 0 && (
            <Link
              href="/procurement/inventory?tab=stock"
              className="col-span-full flex items-center gap-3 p-4 min-h-[44px] rounded-xl border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/40 hover:border-yellow-300 dark:hover:border-yellow-800 transition-colors duration-150 active:scale-[0.97] cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/60 flex items-center justify-center">
                <AlertTriangle size={20} className="text-yellow-700 dark:text-yellow-400" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">{t('dashboard.expiringTitle')}</p>
                <p className="text-xs text-yellow-800/80 dark:text-yellow-400/90">
                  {t('dashboard.expiringDesc', { count: stats.expiring_lots })}
                </p>
              </div>
              <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs font-medium text-yellow-800 dark:text-yellow-300">
                <span className="hidden sm:inline">{t('dashboard.expiringAction')}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </span>
            </Link>
          )}

          {moduleCards.map(({ href, icon: Icon, label, count }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col gap-2 p-4 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors duration-150 active:scale-[0.97] cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <div className="flex items-center justify-between">
                <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                  <Icon size={20} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
                </div>
                <ChevronRight size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
              </div>
              {stats === null && !statsFailed ? (
                <div className="h-8 w-14 rounded-md bg-slate-100 dark:bg-slate-700 animate-pulse" aria-hidden="true" />
              ) : (
                <p className="text-2xl sm:text-3xl font-bold leading-none tabular-nums text-slate-900 dark:text-slate-100">
                  {stats !== null ? count(stats) : '—'}
                </p>
              )}
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{label}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
