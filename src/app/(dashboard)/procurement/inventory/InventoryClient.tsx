'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, PackageCheck, Plus, Search } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import BarcodeScanner from '@/components/procurement/BarcodeScanner'
import {
  SortableHeader, TablePagination, TableSearch, usePagination, useTableSort,
} from '@/components/procurement/table-tools'
import { InvStatusBadge } from './InvStatusBadge'
import { InventoryFormDialog, createFormSeed, type InventoryFormSeed } from './InventoryFormDialog'
import {
  formatQty,
  lookupCode,
  one,
  type Direction,
  type InboundListRow,
  type LookupResult,
  type OutboundListRow,
  type ProductOption,
  type StockRow,
  type WarehouseOption,
} from './types'

// 庫存作業 client — three tabs:
//   入庫單 (inbound orders) / 出庫單 (outbound orders) / 庫存查詢 (stock lookup).
// 單據明細與所有單據動作（送簽／過帳／沖銷／刪除／編輯）都在獨立的明細頁
// /procurement/inventory/[direction]/[id]，與請採購單一致；本頁只負責列表、
// 新增草稿與庫存查詢。stock tab 是 mobile-first：scan a 貨號/庫存編號/批號
// with BarcodeScanner to resolve a product and all of its current lots.
// Quantities are 庫存單位 throughout.

type Tab = Direction | 'stock'

/** Flattened sortable/searchable fields shared by the inbound/outbound list tables. */
type ListRowEnriched = (InboundListRow | OutboundListRow) & {
  source_no: string | null
  item_count: number
  status_label: string
  posted_label: string | null
  creator_name: string | null
  created_date: string
}

type StockRowEnriched = StockRow & {
  warehouse_name: string | null
  warehouse_code: string | null
}

function matchesQuery(values: Array<string | number | null | undefined>, q: string): boolean {
  return values.some(v => v != null && String(v).toLowerCase().includes(q))
}

function filterListRows<T extends ListRowEnriched>(rows: T[], search: string): T[] {
  const q = search.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(r => matchesQuery(
    [r.doc_no, r.source_no, r.order_date, r.status_label, r.posted_label, r.creator_name, r.created_date],
    q,
  ))
}

interface Props {
  currentUserId: string
  initialInbound: InboundListRow[]
  initialOutbound: OutboundListRow[]
  warehouses: WarehouseOption[]
  products: ProductOption[]
  initialStocks: StockRow[]
}

export function InventoryClient({ initialInbound, initialOutbound, warehouses, products, initialStocks }: Props) {
  const t = useTranslations('procurement.inventory')
  const tc = useTranslations('common')
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialTab = searchParams.get('tab')
  const [tab, setTab] = useState<Tab>(
    initialTab === 'outbound' || initialTab === 'stock' ? initialTab : 'inbound'
  )
  const [inboundRows, setInboundRows] = useState<InboundListRow[]>(initialInbound)
  const [outboundRows, setOutboundRows] = useState<OutboundListRow[]>(initialOutbound)
  const [inboundSearch, setInboundSearch] = useState('')
  const [outboundSearch, setOutboundSearch] = useState('')

  // ── create form dialog (drafts only；編輯在明細頁) ──
  const [formSeed, setFormSeed] = useState<InventoryFormSeed | null>(null)

  // ── stock lookup tab ──
  const [stockQuery, setStockQuery] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [lookup, setLookup] = useState<LookupResult | 'not_found' | null>(null)
  const [stockFilter, setStockFilter] = useState('')

  const refreshList = useCallback(async (direction: Direction) => {
    const res = await fetch(`/api/procurement/${direction}`)
    const { data, error } = await res.json()
    if (error) { toast.error(error); return }
    if (direction === 'inbound') setInboundRows(data ?? [])
    else setOutboundRows(data ?? [])
  }, [])

  // ── stock lookup tab ──

  const runLookup = async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setLookingUp(true)
    try {
      const result = await lookupCode(trimmed)
      setLookup(result ?? 'not_found')
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLookingUp(false)
    }
  }

  // ── list tables: search → sort → paginate (20/page) ──

  const inboundEnriched = useMemo<ListRowEnriched[]>(() => inboundRows.map(r => ({
    ...r,
    source_no: one(r.gr)?.doc_no ?? null,
    item_count: one(r.items)?.count ?? 0,
    status_label: t(`statusLabels.${r.status}` as Parameters<typeof t>[0]),
    posted_label: r.posted_at ? t('postedBadge') : null,
    creator_name: one(r.created_by_user)?.display_name ?? null,
    created_date: format(new Date(r.created_at), 'yyyy-MM-dd'),
  })), [inboundRows, t])

  const outboundEnriched = useMemo<ListRowEnriched[]>(() => outboundRows.map(r => ({
    ...r,
    source_no: r.shipment_no ?? null,
    item_count: one(r.items)?.count ?? 0,
    status_label: t(`statusLabels.${r.status}` as Parameters<typeof t>[0]),
    posted_label: r.posted_at ? t('postedBadge') : null,
    creator_name: one(r.created_by_user)?.display_name ?? null,
    created_date: format(new Date(r.created_at), 'yyyy-MM-dd'),
  })), [outboundRows, t])

  const inboundFiltered = useMemo(() => filterListRows(inboundEnriched, inboundSearch), [inboundEnriched, inboundSearch])
  const outboundFiltered = useMemo(() => filterListRows(outboundEnriched, outboundSearch), [outboundEnriched, outboundSearch])

  const inboundSort = useTableSort(inboundFiltered, 'created_at', 'desc')
  const outboundSort = useTableSort(outboundFiltered, 'created_at', 'desc')
  const inboundPag = usePagination(inboundSort.sorted)
  const outboundPag = usePagination(outboundSort.sorted)

  const listSort = tab === 'outbound' ? outboundSort : inboundSort
  const listPag = tab === 'outbound' ? outboundPag : inboundPag
  const listSearch = tab === 'outbound' ? outboundSearch : inboundSearch
  const setListSearch = tab === 'outbound' ? setOutboundSearch : setInboundSearch

  // ── stock table: search → sort → paginate (20/page) ──

  const stockEnriched = useMemo<StockRowEnriched[]>(() => initialStocks.map(s => ({
    ...s,
    warehouse_name: one(s.warehouse)?.name ?? null,
    warehouse_code: one(s.warehouse)?.code ?? null,
  })), [initialStocks])

  const filteredStocks = useMemo(() => {
    const q = stockFilter.trim().toLowerCase()
    if (!q) return stockEnriched
    return stockEnriched.filter(s => matchesQuery(
      [s.stock_code, s.lot_no, s.product_code, s.product_name, s.spec, s.expiry_date, s.warehouse_name, s.warehouse_code],
      q,
    ))
  }, [stockEnriched, stockFilter])

  const stockSort = useTableSort(filteredStocks)
  const stockPag = usePagination(stockSort.sorted)

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {(['inbound', 'outbound', 'stock'] as const).map(key => (
          <button
            key={key}
            onClick={() => {
              setTab(key)
              // 把分頁寫進網址（不觸發 server re-render），從明細頁返回時才會停在同一個 tab
              window.history.replaceState(null, '', `?tab=${key}`)
            }}
            className={cn(
              'px-4 py-2 min-h-[44px] text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap',
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      {/* ── 入庫單 / 出庫單 lists ── */}
      {tab !== 'stock' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <TableSearch value={listSearch} onChange={setListSearch} placeholder={tc('search')} />
            <Button onClick={() => setFormSeed(createFormSeed(tab))} className="min-h-[44px] cursor-pointer">
              <Plus size={16} />
              {tab === 'inbound' ? t('newInbound') : t('newOutbound')}
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <SortableHeader label={t('cols.docNo')} sortKey="doc_no" currentKey={listSort.sortKey} dir={listSort.sortDir} onSort={listSort.toggleSort} />
                  <SortableHeader
                    label={tab === 'inbound' ? t('cols.sourceGr') : t('cols.shipmentNo')}
                    sortKey="source_no"
                    currentKey={listSort.sortKey}
                    dir={listSort.sortDir}
                    onSort={listSort.toggleSort}
                  />
                  <SortableHeader label={t('cols.items')} sortKey="item_count" currentKey={listSort.sortKey} dir={listSort.sortDir} onSort={listSort.toggleSort} className="[&>button]:justify-end" />
                  <SortableHeader label={t('cols.orderDate')} sortKey="order_date" currentKey={listSort.sortKey} dir={listSort.sortDir} onSort={listSort.toggleSort} />
                  <SortableHeader label={t('cols.status')} sortKey="status_label" currentKey={listSort.sortKey} dir={listSort.sortDir} onSort={listSort.toggleSort} />
                  <SortableHeader label={t('cols.posted')} sortKey="posted_at" currentKey={listSort.sortKey} dir={listSort.sortDir} onSort={listSort.toggleSort} />
                  <SortableHeader label={t('cols.creator')} sortKey="creator_name" currentKey={listSort.sortKey} dir={listSort.sortDir} onSort={listSort.toggleSort} />
                  <SortableHeader label={t('cols.createdAt')} sortKey="created_at" currentKey={listSort.sortKey} dir={listSort.sortDir} onSort={listSort.toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {listPag.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400">
                      {listSearch.trim() ? tc('noData') : t('noRecords')}
                    </td>
                  </tr>
                ) : listPag.pageRows.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/procurement/inventory/${tab}/${r.id}`)}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.doc_no ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.source_no ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 tabular-nums">{r.item_count}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.order_date ?? '—'}</td>
                    <td className="px-4 py-3"><InvStatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.posted_at ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-medium bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                          <PackageCheck size={12} aria-hidden />
                          {t('postedBadge')}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.creator_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.created_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={listPag.page} totalPages={listPag.totalPages} total={listPag.total} onPageChange={listPag.setPage} />
        </div>
      )}

      {/* ── 庫存查詢 (scan / search) ── */}
      {tab === 'stock' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">{t('lookupTitle')}</h3>
            <form
              onSubmit={e => { e.preventDefault(); runLookup(stockQuery) }}
              className="flex items-center gap-2 flex-wrap"
            >
              <label htmlFor="stock-lookup-code" className="sr-only">{t('stockSearchLabel')}</label>
              <Input
                id="stock-lookup-code"
                value={stockQuery}
                onChange={e => setStockQuery(e.target.value)}
                placeholder={t('stockSearchLabel')}
                className="text-base min-h-[44px] w-[260px] max-w-full"
              />
              <Button type="submit" variant="outline" disabled={lookingUp} aria-label={t('stockSearchLabel')} className="min-h-[44px] min-w-[44px] cursor-pointer">
                {lookingUp ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              </Button>
              {!formSeed && <BarcodeScanner onScan={code => { setStockQuery(code); runLookup(code) }} />}
            </form>

            {lookup === 'not_found' && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('errors.codeNotFound')}</p>
            )}

            {lookup && lookup !== 'not_found' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  {t('matchedByLabel')}: {t(`matchedBy.${lookup.matched_by}`)}
                </p>
                {lookup.product && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <span className="text-slate-400">{t('itemCols.productCode')}</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">{lookup.product.product_code ?? '—'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">{t('itemCols.productName')}</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">{lookup.product.name}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">{t('itemCols.spec')}</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">{lookup.product.spec ?? '—'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">{t('currentStockQty')}</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5 tabular-nums">
                        {formatQty(lookup.product.current_stock_qty)} {lookup.product.stock_unit ?? ''}
                      </p>
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.stockCode')}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.lotNo')}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.expiryDate')}</th>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.warehouse')}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.quantity')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {lookup.stocks.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-6 text-slate-400">{t('noStocks')}</td></tr>
                      ) : lookup.stocks.map(s => (
                        <tr key={s.id} className="bg-white dark:bg-slate-800">
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{s.stock_code ?? '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.lot_no ?? '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.expiry_date ?? '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{one(s.warehouse)?.name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                            {formatQty(s.quantity)} {s.unit ?? ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* full stock list with client-side filter */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">{t('stockListTitle')}</h3>
              <TableSearch value={stockFilter} onChange={setStockFilter} placeholder={t('stockFilterPlaceholder')} />
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <SortableHeader label={t('itemCols.stockCode')} sortKey="stock_code" currentKey={stockSort.sortKey} dir={stockSort.sortDir} onSort={stockSort.toggleSort} />
                    <SortableHeader label={t('itemCols.productCode')} sortKey="product_code" currentKey={stockSort.sortKey} dir={stockSort.sortDir} onSort={stockSort.toggleSort} />
                    <SortableHeader label={t('itemCols.productName')} sortKey="product_name" currentKey={stockSort.sortKey} dir={stockSort.sortDir} onSort={stockSort.toggleSort} />
                    <SortableHeader label={t('itemCols.spec')} sortKey="spec" currentKey={stockSort.sortKey} dir={stockSort.sortDir} onSort={stockSort.toggleSort} />
                    <SortableHeader label={t('itemCols.lotNo')} sortKey="lot_no" currentKey={stockSort.sortKey} dir={stockSort.sortDir} onSort={stockSort.toggleSort} />
                    <SortableHeader label={t('itemCols.expiryDate')} sortKey="expiry_date" currentKey={stockSort.sortKey} dir={stockSort.sortDir} onSort={stockSort.toggleSort} />
                    <SortableHeader label={t('itemCols.warehouse')} sortKey="warehouse_name" currentKey={stockSort.sortKey} dir={stockSort.sortDir} onSort={stockSort.toggleSort} />
                    <SortableHeader label={t('itemCols.quantity')} sortKey="quantity" currentKey={stockSort.sortKey} dir={stockSort.sortDir} onSort={stockSort.toggleSort} className="[&>button]:justify-end" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {stockPag.pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-slate-400">
                        {stockFilter.trim() ? tc('noData') : t('noStocks')}
                      </td>
                    </tr>
                  ) : stockPag.pageRows.map(s => (
                    <tr key={s.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{s.stock_code ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.product_code ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.product_name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.spec ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.lot_no ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.expiry_date ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.warehouse_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                        {formatQty(s.quantity)} {s.unit ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={stockPag.page} totalPages={stockPag.totalPages} total={stockPag.total} onPageChange={stockPag.setPage} />
          </div>
        </div>
      )}

      {/* ── 新增草稿表單（編輯在明細頁，共用同一個元件） ── */}
      {formSeed && (
        <InventoryFormDialog
          seed={formSeed}
          warehouses={warehouses}
          products={products}
          stocks={initialStocks}
          onClose={() => setFormSeed(null)}
          onSaved={() => { const direction = formSeed.direction; setFormSeed(null); refreshList(direction) }}
        />
      )}
    </div>
  )
}
