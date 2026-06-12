'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, Undo2, PackageOpen, Boxes } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BackLink } from '@/components/procurement/BackLink'

// 商品出入庫分類帳 — info card + year flow table (running balance) + lots in stock.
// All quantities are in the product's stock unit (庫存單位).

interface LedgerProduct {
  id: string
  product_code: string | null
  name: string
  spec: string | null
  brand: string | null
  category: string | null
  item_code: string | null
  purchase_unit: string | null
  stock_unit: string | null
  units_per_purchase: number | string
  current_stock_qty: number | string | null
}

interface LedgerMovement {
  id: string
  created_at: string
  movement_type: 'inbound' | 'outbound' | 'adjust' | 'void'
  delta_qty: number
  balance: number
  doc_type: string | null
  doc_id: string | null
  doc_no: string | null
  lot_no: string | null
  stock_code: string | null
  warehouse_id: string | null
  warehouse_name: string | null
  note: string | null
}

interface YearSummary {
  year: number
  inbound_qty: number
  outbound_qty: number
  ending_balance: number
  count: number
}

interface LedgerLot {
  id: string
  lot_no: string | null
  stock_code: string | null
  expiry_date: string | null
  quantity: number
  warehouse_id: string | null
  warehouse_name: string | null
}

interface LedgerData {
  current_qty: number
  year: number
  years: YearSummary[]
  movements: LedgerMovement[]
  lots: LedgerLot[]
}

/** Detail routes per source document type (inventory pages ship in Phase B). */
function docHref(docType: string | null, docId: string | null): string | null {
  if (!docId) return null
  switch (docType) {
    case 'inbound_order':
      return `/procurement/inventory/inbound/${docId}`
    case 'outbound_order':
      return `/procurement/inventory/outbound/${docId}`
    default:
      return null
  }
}

const TYPE_STYLE: Record<LedgerMovement['movement_type'], string> = {
  inbound: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  outbound: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  adjust: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  void: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
}

const TYPE_ICON: Record<LedgerMovement['movement_type'], typeof ArrowDownToLine> = {
  inbound: ArrowDownToLine,
  outbound: ArrowUpFromLine,
  adjust: SlidersHorizontal,
  void: Undo2,
}

const EXPIRY_SOON_DAYS = 90

function formatQty(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : '−'}${formatQty(Math.abs(value))}`
}

function formatRate(value: number | string | null | undefined): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
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

/** 'expired' | 'soon' | null, comparing date-only in local time */
function expiryState(expiry: string | null): 'expired' | 'soon' | null {
  if (!expiry) return null
  const d = new Date(`${expiry}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'expired'
  if (diffDays <= EXPIRY_SOON_DAYS) return 'soon'
  return null
}

function TypeBadge({ type, label }: { type: LedgerMovement['movement_type']; label: string }) {
  const Icon = TYPE_ICON[type]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap', TYPE_STYLE[type])}>
      <Icon size={12} aria-hidden />
      {label}
    </span>
  )
}

export function ProductLedgerClient({ product }: { product: LedgerProduct }) {
  const t = useTranslations('procurement.ledger')

  const [data, setData] = useState<LedgerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState<number | null>(null)

  const load = useCallback(async (requestedYear: number | null) => {
    setLoading(true)
    try {
      const qs = requestedYear != null ? `?year=${requestedYear}` : ''
      const res = await fetch(`/api/procurement/products/${product.id}/ledger${qs}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? t('loadFailed'))
        return
      }
      setData(json.data)
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [product.id, t])

  useEffect(() => { load(year) }, [load, year])

  const stockUnit = product.stock_unit ?? ''
  const currentQty = data?.current_qty ?? Number(product.current_stock_qty ?? 0)
  const yearSummary = data?.years.find(y => y.year === data.year) ?? null
  const typeLabel = (type: LedgerMovement['movement_type']) => t(`type_${type}` as Parameters<typeof t>[0])

  const docCell = (m: LedgerMovement) => {
    const href = docHref(m.doc_type, m.doc_id)
    if (!m.doc_no) return <span className="text-slate-400 dark:text-slate-500">—</span>
    if (!href) return <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{m.doc_no}</span>
    return (
      <Link
        href={href}
        className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
      >
        {m.doc_no}
      </Link>
    )
  }

  return (
    <div className="space-y-6">
      <BackLink fallbackHref="/procurement/products" />

      {/* ── Product info card: dual units + current total ── */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm flex-1">
            {([
              [t('specLabel'), product.spec],
              [t('brandLabel'), product.brand],
              [t('categoryLabel'), product.category],
              [t('itemCodeLabel'), product.item_code],
              [t('purchaseUnitLabel'), product.purchase_unit],
              [t('stockUnitLabel'), product.stock_unit],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="text-slate-800 dark:text-slate-200">{value || '—'}</dd>
              </div>
            ))}
          </dl>
          <div className="sm:text-right shrink-0 sm:pl-6 sm:border-l border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('currentTotal')}</p>
            <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100 font-[Lexend]">
              {formatQty(currentQty)}
              {stockUnit && <span className="ml-1 text-base font-medium text-slate-500 dark:text-slate-400">{stockUnit}</span>}
            </p>
            {product.purchase_unit && product.stock_unit && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t('conversionFormula', {
                  purchaseUnit: product.purchase_unit,
                  rate: formatRate(product.units_per_purchase),
                  stockUnit: product.stock_unit,
                })}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Lots currently in stock ── */}
      <section>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
          <Boxes size={18} aria-hidden className="text-slate-400" /> {t('lotsTitle')}
        </h2>
        {loading && !data ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('loading')}</p>
        ) : !data || data.lots.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-4">
            {t('lotsEmpty')}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.lots.map(lot => {
              const state = expiryState(lot.expiry_date)
              return (
                <div
                  key={lot.id}
                  className={cn(
                    'rounded-lg border p-3',
                    state === 'expired'
                      ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                      : state === 'soon'
                        ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20'
                        : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {lot.lot_no || t('noLotNo')}
                    </p>
                    <p className="tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatQty(lot.quantity)}{stockUnit && <span className="ml-0.5 text-xs font-normal text-slate-500 dark:text-slate-400">{stockUnit}</span>}
                    </p>
                  </div>
                  <dl className="mt-1.5 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {lot.stock_code && (
                      <div className="flex justify-between gap-2">
                        <dt>{t('stockCode')}</dt>
                        <dd className="font-mono">{lot.stock_code}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <dt>{t('warehouse')}</dt>
                      <dd>{lot.warehouse_name ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{t('expiry')}</dt>
                      <dd className={cn(
                        state === 'expired' && 'text-red-700 dark:text-red-300 font-medium',
                        state === 'soon' && 'text-orange-700 dark:text-orange-300 font-medium',
                      )}>
                        {lot.expiry_date ?? '—'}
                        {state === 'expired' && ` · ${t('expired')}`}
                        {state === 'soon' && ` · ${t('expiringSoon')}`}
                      </dd>
                    </div>
                  </dl>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Year selector + movement flow ── */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">{t('flowTitle')}</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="ledger-year" className="text-sm text-slate-600 dark:text-slate-400">{t('yearLabel')}</label>
            <select
              id="ledger-year"
              value={data?.year ?? year ?? ''}
              onChange={e => setYear(Number(e.target.value))}
              disabled={loading || !data || data.years.length === 0}
              className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-base text-slate-800 dark:text-slate-200 focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {(data?.years.length ? data.years : data ? [{ year: data.year }] : []).map(y => (
                <option key={y.year} value={y.year}>{t('yearOption', { year: y.year })}</option>
              ))}
            </select>
          </div>
        </div>

        {yearSummary && (
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
              <p className="text-xs text-green-800 dark:text-green-300">{t('summaryInbound')}</p>
              <p className="tabular-nums font-semibold text-green-900 dark:text-green-200">
                +{formatQty(yearSummary.inbound_qty)}{stockUnit && ` ${stockUnit}`}
              </p>
            </div>
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
              <p className="text-xs text-red-800 dark:text-red-300">{t('summaryOutbound')}</p>
              <p className="tabular-nums font-semibold text-red-900 dark:text-red-200">
                −{formatQty(yearSummary.outbound_qty)}{stockUnit && ` ${stockUnit}`}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('summaryEnding')}</p>
              <p className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {formatQty(yearSummary.ending_balance)}{stockUnit && ` ${stockUnit}`}
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 p-6 text-center">
            {t('loading')}
          </p>
        ) : !data || data.movements.length === 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">
            <PackageOpen size={24} className="mx-auto mb-2 text-slate-400" aria-hidden />
            <p className="text-sm">{data && data.years.length === 0 ? t('emptyLedger') : t('emptyYear')}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colDate')}</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colType')}</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colDoc')}</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colLot')}</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colWarehouse')}</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colQty')}</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('colBalance')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {data.movements.map(m => (
                      <tr key={m.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">{formatDateTime(m.created_at)}</td>
                        <td className="px-4 py-3"><TypeBadge type={m.movement_type} label={typeLabel(m.movement_type)} /></td>
                        <td className="px-4 py-3 whitespace-nowrap">{docCell(m)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {m.lot_no ?? '—'}
                          {m.stock_code && <span className="ml-1 font-mono text-xs text-slate-400 dark:text-slate-500">{m.stock_code}</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.warehouse_name ?? '—'}</td>
                        <td className={cn(
                          'px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap',
                          m.delta_qty >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400',
                        )}>
                          {formatSigned(m.delta_qty)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatQty(m.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400">
                {t('movementCount', { count: data.movements.length })}
              </p>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {data.movements.map(m => (
                <div key={m.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <TypeBadge type={m.movement_type} label={typeLabel(m.movement_type)} />
                    <span className={cn(
                      'tabular-nums font-semibold',
                      m.delta_qty >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400',
                    )}>
                      {formatSigned(m.delta_qty)}{stockUnit && <span className="ml-0.5 text-xs font-normal">{stockUnit}</span>}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="tabular-nums">{formatDateTime(m.created_at)}</span>
                    {docCell(m)}
                  </div>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex justify-between gap-2">
                      <dt>{t('colLot')}</dt>
                      <dd className="text-slate-700 dark:text-slate-300">{m.lot_no ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{t('colWarehouse')}</dt>
                      <dd className="text-slate-700 dark:text-slate-300">{m.warehouse_name ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2 col-span-2">
                      <dt>{t('colBalance')}</dt>
                      <dd className="tabular-nums font-medium text-slate-800 dark:text-slate-200">
                        {formatQty(m.balance)}{stockUnit && ` ${stockUnit}`}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
              <p className="text-xs text-center text-slate-500 dark:text-slate-400 pt-1">
                {t('movementCount', { count: data.movements.length })}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
