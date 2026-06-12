'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Loader2, PackageCheck, Pencil, Plus, Search, Send, Trash2, Undo2,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { ApprovalTimeline } from '@/components/procurement/ApprovalTimeline'
import { ApprovalActions } from '@/components/procurement/ApprovalActions'
import BarcodeScanner from '@/components/procurement/BarcodeScanner'
import type { DocStatus } from '@/lib/procurement/doc-types'
import {
  STATUS_STYLE,
  formatQty,
  lookupCode,
  one,
  type Direction,
  type InboundItemRow,
  type InboundListRow,
  type LookupResult,
  type OrderDetail,
  type OutboundItemRow,
  type OutboundListRow,
  type ProductOption,
  type StockRow,
  type WarehouseOption,
} from './types'

// 庫存作業 client — three tabs:
//   入庫單 (inbound orders) / 出庫單 (outbound orders) / 庫存查詢 (stock lookup).
// Documents are created/edited in a dialog (drafts only), submitted through the
// shared approval engine, and 過帳/沖銷過帳 via the post/unpost API routes
// (server enforces status + creator/manage permissions). The stock tab is
// mobile-first: scan a 貨號/庫存編號/批號 with BarcodeScanner to resolve a
// product and all of its current lots. Quantities are 庫存單位 throughout.

type Tab = Direction | 'stock'

function InvStatusBadge({ status }: { status: DocStatus }) {
  const t = useTranslations('procurement.inventory')
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap', STATUS_STYLE[status])}>
      {t(`statusLabels.${status}` as Parameters<typeof t>[0])}
    </span>
  )
}

interface InboundFormRow {
  key: string
  product_id: string
  warehouse_id: string
  lot_no: string
  expiry_date: string
  quantity: string
  notes: string
}

interface OutboundFormRow {
  key: string
  warehouse_stock_id: string
  used_qty: string
  notes: string
}

let localKeySeq = 0
function nextKey(): string {
  localKeySeq += 1
  return `local-${localKeySeq}`
}

function toPositive(s: string): number | null {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
}

type DetailState =
  | { direction: 'inbound'; data: OrderDetail<InboundItemRow> }
  | { direction: 'outbound'; data: OrderDetail<OutboundItemRow> }

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

  // ── detail dialog ──
  const [detailOpen, setDetailOpen] = useState<{ direction: Direction; id: string } | null>(null)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [acting, setActing] = useState<'submit' | 'post' | 'unpost' | 'delete' | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [unpostConfirmOpen, setUnpostConfirmOpen] = useState(false)

  // ── create / edit form dialog (drafts only) ──
  const [formOpen, setFormOpen] = useState(false)
  const [formDirection, setFormDirection] = useState<Direction>('inbound')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [header, setHeader] = useState<Record<string, string>>({})
  const [inRows, setInRows] = useState<InboundFormRow[]>([])
  const [outRows, setOutRows] = useState<OutboundFormRow[]>([])
  const [saving, setSaving] = useState(false)

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

  const loadDetail = useCallback(async (direction: Direction, id: string) => {
    const res = await fetch(`/api/procurement/${direction}/${id}`)
    const { data, error } = await res.json()
    if (error || !data) {
      toast.error(error ?? t('loadFailed'))
      setDetailOpen(null)
      return
    }
    setDetail({ direction, data } as DetailState)
  }, [t])

  const openDetail = (direction: Direction, id: string) => {
    setDetail(null)
    setDetailOpen({ direction, id })
    loadDetail(direction, id)
  }

  // ── create / edit ──

  const openCreate = (direction: Direction) => {
    setFormDirection(direction)
    setEditingId(null)
    setHeader({ order_date: format(new Date(), 'yyyy-MM-dd') })
    setInRows([])
    setOutRows([])
    setFormOpen(true)
  }

  const openEdit = () => {
    if (!detail) return
    const doc = detail.data.doc
    setFormDirection(detail.direction)
    setEditingId(doc.id)
    if (detail.direction === 'inbound') {
      const gr = one(doc.gr as InboundListRow['gr'])
      setHeader({
        gr_doc_no: gr?.doc_no ?? '',
        order_date: typeof doc.order_date === 'string' ? doc.order_date : '',
        notes: typeof doc.notes === 'string' ? doc.notes : '',
      })
      setInRows(detail.data.items.map(it => ({
        key: it.id,
        product_id: it.product_id ?? '',
        warehouse_id: it.warehouse_id ?? '',
        lot_no: it.lot_no ?? '',
        expiry_date: it.expiry_date ?? '',
        quantity: String(it.quantity),
        notes: it.notes ?? '',
      })))
    } else {
      setHeader({
        order_date: typeof doc.order_date === 'string' ? doc.order_date : '',
        shipment_no: typeof doc.shipment_no === 'string' ? doc.shipment_no : '',
        notes: typeof doc.notes === 'string' ? doc.notes : '',
      })
      setOutRows(detail.data.items.map(it => ({
        key: it.id,
        warehouse_stock_id: it.warehouse_stock_id ?? '',
        used_qty: String(it.used_qty),
        notes: it.notes ?? '',
      })))
    }
    setFormOpen(true)
  }

  const buildPayload = (): Record<string, unknown> | null => {
    if (formDirection === 'inbound') {
      const items = []
      for (const row of inRows) {
        const quantity = toPositive(row.quantity)
        if (!row.product_id || !row.warehouse_id || quantity === null) return null
        items.push({
          product_id: row.product_id,
          warehouse_id: row.warehouse_id,
          lot_no: row.lot_no || null,
          expiry_date: row.expiry_date || null,
          quantity,
          notes: row.notes || null,
        })
      }
      return {
        gr_doc_no: header.gr_doc_no ?? '',
        order_date: header.order_date ?? '',
        notes: header.notes ?? '',
        items,
      }
    }
    const items = []
    for (const row of outRows) {
      const used_qty = toPositive(row.used_qty)
      if (!row.warehouse_stock_id || used_qty === null) return null
      items.push({ warehouse_stock_id: row.warehouse_stock_id, used_qty, notes: row.notes || null })
    }
    return {
      order_date: header.order_date ?? '',
      shipment_no: header.shipment_no ?? '',
      notes: header.notes ?? '',
      items,
    }
  }

  const handleSave = async () => {
    const itemCount = formDirection === 'inbound' ? inRows.length : outRows.length
    if (itemCount === 0) { toast.error(t('itemsRequired')); return }
    const payload = buildPayload()
    if (payload === null) { toast.error(t('errors.itemInvalid')); return }
    setSaving(true)
    const url = editingId
      ? `/api/procurement/${formDirection}/${editingId}`
      : `/api/procurement/${formDirection}`
    const res = await fetch(url, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    toast.success(editingId ? tc('saved') : t('created'))
    setFormOpen(false)
    refreshList(formDirection)
    if (editingId && detailOpen) loadDetail(detailOpen.direction, detailOpen.id)
  }

  // ── document actions (server re-checks status + permissions) ──

  const handleSubmitForApproval = async () => {
    if (!detailOpen) return
    setActing('submit')
    const docType = detailOpen.direction === 'inbound' ? 'inbound_order' : 'outbound_order'
    const res = await fetch(`/api/procurement/approvals/${docType}/${detailOpen.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    })
    const { error } = await res.json()
    setActing(null)
    if (error) { toast.error(error); return }
    toast.success(t('submitted'))
    refreshList(detailOpen.direction)
    loadDetail(detailOpen.direction, detailOpen.id)
  }

  /** 庫存過帳 / 沖銷過帳 — atomic SECURITY DEFINER fns behind the API */
  const handlePostAction = async (action: 'post' | 'unpost') => {
    if (!detailOpen) return
    setActing(action)
    const res = await fetch(`/api/procurement/${detailOpen.direction}/${detailOpen.id}/${action}`, { method: 'POST' })
    const { error } = await res.json()
    setActing(null)
    setUnpostConfirmOpen(false)
    if (error) { toast.error(error); return }
    toast.success(action === 'post' ? t('postSuccess') : t('unpostSuccess'))
    refreshList(detailOpen.direction)
    loadDetail(detailOpen.direction, detailOpen.id)
    router.refresh() // re-pull warehouse_stock / products server props
  }

  const handleDelete = async () => {
    if (!detailOpen) return
    setActing('delete')
    const res = await fetch(`/api/procurement/${detailOpen.direction}/${detailOpen.id}`, { method: 'DELETE' })
    const { error } = await res.json()
    setActing(null)
    setDeleteConfirmOpen(false)
    if (error) { toast.error(error); return }
    toast.success(t('deleted'))
    setDetailOpen(null)
    setDetail(null)
    refreshList(detailOpen.direction)
  }

  // ── scanning into the form (連掃累加) ──

  const handleFormScan = async (code: string) => {
    try {
      const result = await lookupCode(code)
      const product = result?.product
      if (!result || !product) { toast.error(t('errors.codeNotFound')); return }
      if (formDirection === 'inbound') {
        const stock = result.stocks[0] ?? null
        const lotNo = result.matched_by === 'lot_no' ? code : stock?.lot_no ?? ''
        const warehouseId = stock?.warehouse_id ?? warehouses[0]?.id ?? ''
        setInRows(prev => {
          const idx = prev.findIndex(r => r.product_id === product.id && r.lot_no === lotNo && r.warehouse_id === warehouseId)
          if (idx >= 0) {
            return prev.map((r, i) => i === idx
              ? { ...r, quantity: String((toPositive(r.quantity) ?? 0) + 1) }
              : r)
          }
          return [...prev, {
            key: nextKey(),
            product_id: product.id,
            warehouse_id: warehouseId,
            lot_no: lotNo,
            expiry_date: stock?.expiry_date ?? '',
            quantity: '1',
            notes: '',
          }]
        })
      } else {
        const stock = result.stocks.find(s => s.quantity > 0) ?? result.stocks[0]
        if (!stock) { toast.error(t('errors.stockNotFound')); return }
        setOutRows(prev => {
          const idx = prev.findIndex(r => r.warehouse_stock_id === stock.id)
          if (idx >= 0) {
            return prev.map((r, i) => i === idx
              ? { ...r, used_qty: String((toPositive(r.used_qty) ?? 0) + 1) }
              : r)
          }
          return [...prev, { key: nextKey(), warehouse_stock_id: stock.id, used_qty: '1', notes: '' }]
        })
      }
    } catch {
      toast.error(t('loadFailed'))
    }
  }

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

  const filteredStocks = useMemo(() => {
    const q = stockFilter.trim().toLowerCase()
    if (!q) return initialStocks
    return initialStocks.filter(s =>
      [s.stock_code, s.lot_no, s.product_code, s.product_name, s.spec, one(s.warehouse)?.name, one(s.warehouse)?.code]
        .some(v => v && v.toLowerCase().includes(q)))
  }, [initialStocks, stockFilter])

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const stockById = useMemo(() => new Map(initialStocks.map(s => [s.id, s])), [initialStocks])

  const stockOptionLabel = (s: StockRow): string => {
    const parts = [s.stock_code ?? '—', s.product_name ?? s.product_code ?? '—']
    if (s.lot_no) parts.push(s.lot_no)
    const wh = one(s.warehouse)
    if (wh) parts.push(wh.name)
    return `${parts.join(' · ')} (${formatQty(s.quantity)})`
  }

  const doc = detail?.data.doc ?? null
  const isPosted = !!(doc && doc.posted_at)
  const detailDocType = detail?.direction === 'inbound' ? 'inbound_order' : 'outbound_order'

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {(['inbound', 'outbound', 'stock'] as const).map(key => (
          <button
            key={key}
            onClick={() => setTab(key)}
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
          <div className="flex justify-end">
            <Button onClick={() => openCreate(tab)} className="min-h-[44px] cursor-pointer">
              <Plus size={16} />
              {tab === 'inbound' ? t('newInbound') : t('newOutbound')}
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('cols.docNo')}</th>
                  {tab === 'inbound'
                    ? <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('cols.sourceGr')}</th>
                    : <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('cols.shipmentNo')}</th>}
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('cols.items')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('cols.orderDate')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('cols.status')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('cols.posted')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('cols.creator')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('cols.createdAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {(tab === 'inbound' ? inboundRows : outboundRows).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400">{t('noRecords')}</td>
                  </tr>
                ) : (tab === 'inbound' ? inboundRows : outboundRows).map(r => (
                  <tr
                    key={r.id}
                    onClick={() => openDetail(tab, r.id)}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.doc_no ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {tab === 'inbound'
                        ? one((r as InboundListRow).gr)?.doc_no ?? '—'
                        : (r as OutboundListRow).shipment_no ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 tabular-nums">{one(r.items)?.count ?? 0}</td>
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
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{one(r.created_by_user)?.display_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{format(new Date(r.created_at), 'yyyy-MM-dd')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              {!formOpen && <BarcodeScanner onScan={code => { setStockQuery(code); runLookup(code) }} />}
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
              <div>
                <label htmlFor="stock-filter" className="sr-only">{t('stockFilterPlaceholder')}</label>
                <Input
                  id="stock-filter"
                  value={stockFilter}
                  onChange={e => setStockFilter(e.target.value)}
                  placeholder={t('stockFilterPlaceholder')}
                  className="text-base min-h-[44px] w-[240px]"
                />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.stockCode')}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.productCode')}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.productName')}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.spec')}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.lotNo')}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.expiryDate')}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.warehouse')}</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.quantity')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredStocks.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-slate-400">{t('noStocks')}</td></tr>
                  ) : filteredStocks.map(s => (
                    <tr key={s.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{s.stock_code ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.product_code ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.product_name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.spec ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.lot_no ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{s.expiry_date ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{one(s.warehouse)?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                        {formatQty(s.quantity)} {s.unit ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── detail dialog ── */}
      <Dialog open={detailOpen !== null} onOpenChange={open => { if (!open) { setDetailOpen(null); setDetail(null) } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {detailOpen && t(`detailTitle.${detailOpen.direction}`)}
              {doc?.doc_no ? <span>{doc.doc_no}</span> : null}
              {doc && <InvStatusBadge status={doc.status} />}
              {isPosted && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-medium bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                  <PackageCheck size={12} aria-hidden />
                  {t('postedBadge')}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {!detail || !doc ? (
            <p className="text-sm text-slate-400 py-10 text-center">{tc('loading')}</p>
          ) : (
            <div className="space-y-5">
              {/* header info */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="text-slate-400">{t('fields.order_date')}</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5">{typeof doc.order_date === 'string' ? doc.order_date : '—'}</p>
                </div>
                {detail.direction === 'inbound' ? (
                  <>
                    <div>
                      <span className="text-slate-400">{t('fields.gr_doc_no')}</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">{one(doc.gr as InboundListRow['gr'])?.doc_no ?? '—'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">{t('fields.is_new_lot')}</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.is_new_lot === true ? t('yes') : t('no')}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">{t('fields.stocked_at')}</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                        {typeof doc.stocked_at === 'string' ? format(new Date(doc.stocked_at), 'yyyy-MM-dd HH:mm') : '—'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-slate-400">{t('fields.shipment_no')}</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">{typeof doc.shipment_no === 'string' && doc.shipment_no ? doc.shipment_no : '—'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">{t('fields.deducted_at')}</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                        {typeof doc.deducted_at === 'string' ? format(new Date(doc.deducted_at), 'yyyy-MM-dd HH:mm') : '—'}
                      </p>
                    </div>
                  </>
                )}
                <div>
                  <span className="text-slate-400">{t('fields.posted_at')}</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                    {typeof doc.posted_at === 'string' ? format(new Date(doc.posted_at), 'yyyy-MM-dd HH:mm') : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">{t('fields.created_by')}</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.created_by_name ?? '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">{t('fields.created_at')}</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5">{format(new Date(doc.created_at), 'yyyy-MM-dd HH:mm')}</p>
                </div>
              </div>

              {typeof doc.notes === 'string' && doc.notes && (
                <div className="text-sm">
                  <span className="text-slate-400">{t('fields.notes')}</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">{doc.notes}</p>
                </div>
              )}

              {/* items */}
              <section>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('itemsTitle')}</h3>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                  {detail.direction === 'inbound' ? (
                    <table className="w-full text-sm min-w-[720px]">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400 w-10">{t('itemCols.lineNo')}</th>
                          <th className="text-left px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.productCode')}</th>
                          <th className="text-left px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.productName')}</th>
                          <th className="text-left px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.warehouse')}</th>
                          <th className="text-left px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.lotNo')}</th>
                          <th className="text-left px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.expiryDate')}</th>
                          <th className="text-right px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.quantity')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {detail.data.items.map((it, i) => (
                          <tr key={it.id} className="bg-white dark:bg-slate-800">
                            <td className="px-3 py-2.5 text-slate-500 tabular-nums">{it.line_no ?? i + 1}</td>
                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{it.product_code ?? '—'}</td>
                            <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{it.product_name ?? '—'}</td>
                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{one(it.warehouse)?.name ?? '—'}</td>
                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{it.lot_no ?? '—'}</td>
                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{it.expiry_date ?? '—'}</td>
                            <td className="px-3 py-2.5 text-right text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                              {formatQty(it.quantity)} {it.unit ?? ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-sm min-w-[760px]">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400 w-10">{t('itemCols.lineNo')}</th>
                          <th className="text-left px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.stockCode')}</th>
                          <th className="text-left px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.productName')}</th>
                          <th className="text-left px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.warehouse')}</th>
                          <th className="text-right px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.warehouseQty')}</th>
                          <th className="text-right px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.usedQty')}</th>
                          <th className="text-right px-3 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('itemCols.qtyAfterUse')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {detail.data.items.map((it, i) => (
                          <tr key={it.id} className="bg-white dark:bg-slate-800">
                            <td className="px-3 py-2.5 text-slate-500 tabular-nums">{it.line_no ?? i + 1}</td>
                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{it.stock_code ?? '—'}</td>
                            <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{it.product_name ?? '—'}</td>
                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{one(one(it.stock)?.warehouse ?? null)?.name ?? '—'}</td>
                            <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">{formatQty(it.warehouse_qty)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                              {formatQty(it.used_qty)} {it.unit ?? ''}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">{formatQty(it.qty_after_use)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              {/* approval */}
              <ApprovalTimeline docType={detailDocType} steps={detail.data.steps} docStatus={detail.data.doc.status} />
              {detail.data.can_act && detail.data.current_step_kind && detailOpen && (
                <ApprovalActions
                  docType={detailDocType}
                  docId={detailOpen.id}
                  stepKind={detail.data.current_step_kind}
                  onActed={() => {
                    refreshList(detailOpen.direction)
                    loadDetail(detailOpen.direction, detailOpen.id)
                  }}
                />
              )}

              {/* document actions — server re-validates status & permissions */}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 dark:border-slate-700 pt-4">
                {doc.status === 'draft' && !isPosted && (
                  <>
                    <Button variant="outline" onClick={openEdit} disabled={acting !== null} className="min-h-[44px] cursor-pointer">
                      <Pencil size={16} />
                      {tc('edit')}
                    </Button>
                    <Button onClick={handleSubmitForApproval} disabled={acting !== null} className="min-h-[44px] cursor-pointer">
                      {acting === 'submit' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      {t('submitForApproval')}
                    </Button>
                    <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)} disabled={acting !== null} className="min-h-[44px] cursor-pointer">
                      <Trash2 size={16} />
                      {t('deleteDraft')}
                    </Button>
                  </>
                )}
                {doc.status === 'approved' && !isPosted && (
                  <Button onClick={() => handlePostAction('post')} disabled={acting !== null} className="min-h-[44px] cursor-pointer">
                    {acting === 'post' ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
                    {t('post')}
                  </Button>
                )}
                {isPosted && (
                  <Button variant="destructive" onClick={() => setUnpostConfirmOpen(true)} disabled={acting !== null} className="min-h-[44px] cursor-pointer">
                    <Undo2 size={16} />
                    {t('unpost')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* delete draft confirm */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('deleteConfirmTitle', { docNo: doc?.doc_no ?? '' })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('deleteConfirmText')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={acting !== null} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={acting !== null} className="min-h-[44px] cursor-pointer">
              {acting === 'delete' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {t('deleteDraft')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* unpost confirm (reverses warehouse_stock + writes void ledger movements) */}
      <Dialog open={unpostConfirmOpen} onOpenChange={setUnpostConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('unpostConfirmTitle', { docNo: doc?.doc_no ?? '' })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('unpostConfirmText')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnpostConfirmOpen(false)} disabled={acting !== null} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={() => handlePostAction('unpost')} disabled={acting !== null} className="min-h-[44px] cursor-pointer">
              {acting === 'unpost' ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
              {t('unpost')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── create / edit form dialog ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t(`formTitle.${editingId ? 'edit' : 'create'}${formDirection === 'inbound' ? 'Inbound' : 'Outbound'}` as Parameters<typeof t>[0])}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* header fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {formDirection === 'inbound' ? (
                <div>
                  <label htmlFor="inv-gr-doc-no" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('fields.gr_doc_no')}
                  </label>
                  <Input
                    id="inv-gr-doc-no"
                    value={header.gr_doc_no ?? ''}
                    onChange={e => setHeader(prev => ({ ...prev, gr_doc_no: e.target.value }))}
                    placeholder={t('grDocNoPlaceholder')}
                    className="text-base"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="inv-shipment-no" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('fields.shipment_no')}
                  </label>
                  <Input
                    id="inv-shipment-no"
                    value={header.shipment_no ?? ''}
                    onChange={e => setHeader(prev => ({ ...prev, shipment_no: e.target.value }))}
                    className="text-base"
                  />
                </div>
              )}
              <div>
                <label htmlFor="inv-order-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('fields.order_date')}
                </label>
                <Input
                  id="inv-order-date"
                  type="date"
                  value={header.order_date ?? ''}
                  onChange={e => setHeader(prev => ({ ...prev, order_date: e.target.value }))}
                  className="text-base"
                />
              </div>
            </div>

            {/* items editor */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('itemsTitle')}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <BarcodeScanner onScan={handleFormScan} continuous />
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (formDirection === 'inbound') {
                        setInRows(prev => [...prev, {
                          key: nextKey(), product_id: '', warehouse_id: warehouses[0]?.id ?? '',
                          lot_no: '', expiry_date: '', quantity: '1', notes: '',
                        }])
                      } else {
                        setOutRows(prev => [...prev, { key: nextKey(), warehouse_stock_id: '', used_qty: '1', notes: '' }])
                      }
                    }}
                    className="min-h-[44px] cursor-pointer"
                  >
                    <Plus size={16} />
                    {t('addItem')}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-slate-400">{t('scanToAdd')}</p>

              {formDirection === 'inbound' ? (
                inRows.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">{t('itemsRequired')}</p>
                ) : (
                  <div className="space-y-3">
                    {inRows.map((row, i) => {
                      const product = row.product_id ? productById.get(row.product_id) : undefined
                      return (
                        <div key={row.key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-500 tabular-nums">#{i + 1}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setInRows(prev => prev.filter(r => r.key !== row.key))}
                              aria-label={t('removeRow')}
                              className="min-h-[44px] min-w-[44px] text-red-600 hover:text-red-700 cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label htmlFor={`in-product-${row.key}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {t('itemCols.product')}
                              </label>
                              <Select value={row.product_id} onValueChange={v => setInRows(prev => prev.map(r => r.key === row.key ? { ...r, product_id: v ?? '' } : r))}>
                                <SelectTrigger id={`in-product-${row.key}`} className="min-h-[44px] w-full">
                                  <SelectValue placeholder={t('productPlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.product_code ? `${p.product_code} · ${p.name}` : p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label htmlFor={`in-warehouse-${row.key}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {t('itemCols.warehouse')}
                              </label>
                              <Select value={row.warehouse_id} onValueChange={v => setInRows(prev => prev.map(r => r.key === row.key ? { ...r, warehouse_id: v ?? '' } : r))}>
                                <SelectTrigger id={`in-warehouse-${row.key}`} className="min-h-[44px] w-full">
                                  <SelectValue placeholder={t('warehousePlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {warehouses.map(w => (
                                    <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label htmlFor={`in-lot-${row.key}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {t('itemCols.lotNo')}
                              </label>
                              <Input
                                id={`in-lot-${row.key}`}
                                value={row.lot_no}
                                onChange={e => setInRows(prev => prev.map(r => r.key === row.key ? { ...r, lot_no: e.target.value } : r))}
                                className="text-base"
                              />
                            </div>
                            <div>
                              <label htmlFor={`in-expiry-${row.key}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {t('itemCols.expiryDate')}
                              </label>
                              <Input
                                id={`in-expiry-${row.key}`}
                                type="date"
                                value={row.expiry_date}
                                onChange={e => setInRows(prev => prev.map(r => r.key === row.key ? { ...r, expiry_date: e.target.value } : r))}
                                className="text-base"
                              />
                            </div>
                            <div>
                              <label htmlFor={`in-qty-${row.key}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {t('itemCols.quantity')}{product?.stock_unit ? ` (${product.stock_unit})` : ''} <span className="text-red-500">*</span>
                              </label>
                              <Input
                                id={`in-qty-${row.key}`}
                                type="number"
                                inputMode="decimal"
                                min="0"
                                value={row.quantity}
                                onChange={e => setInRows(prev => prev.map(r => r.key === row.key ? { ...r, quantity: e.target.value } : r))}
                                className="text-base text-right tabular-nums"
                              />
                            </div>
                            <div>
                              <label htmlFor={`in-notes-${row.key}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {t('itemCols.notes')}
                              </label>
                              <Input
                                id={`in-notes-${row.key}`}
                                value={row.notes}
                                onChange={e => setInRows(prev => prev.map(r => r.key === row.key ? { ...r, notes: e.target.value } : r))}
                                className="text-base"
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : (
                outRows.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">{t('itemsRequired')}</p>
                ) : (
                  <div className="space-y-3">
                    {outRows.map((row, i) => {
                      const stock = row.warehouse_stock_id ? stockById.get(row.warehouse_stock_id) : undefined
                      return (
                        <div key={row.key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-500 tabular-nums">#{i + 1}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setOutRows(prev => prev.filter(r => r.key !== row.key))}
                              aria-label={t('removeRow')}
                              className="min-h-[44px] min-w-[44px] text-red-600 hover:text-red-700 cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2">
                              <label htmlFor={`out-stock-${row.key}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {t('itemCols.stockCode')}
                              </label>
                              <Select value={row.warehouse_stock_id} onValueChange={v => setOutRows(prev => prev.map(r => r.key === row.key ? { ...r, warehouse_stock_id: v ?? '' } : r))}>
                                <SelectTrigger id={`out-stock-${row.key}`} className="min-h-[44px] w-full">
                                  <SelectValue placeholder={t('stockPlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {initialStocks.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{stockOptionLabel(s)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {stock && (
                                <p className="text-xs text-slate-400 mt-1 tabular-nums">
                                  {t('availableQty')}: {formatQty(stock.quantity)} {stock.unit ?? ''}
                                </p>
                              )}
                            </div>
                            <div>
                              <label htmlFor={`out-qty-${row.key}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {t('itemCols.usedQty')} <span className="text-red-500">*</span>
                              </label>
                              <Input
                                id={`out-qty-${row.key}`}
                                type="number"
                                inputMode="decimal"
                                min="0"
                                value={row.used_qty}
                                onChange={e => setOutRows(prev => prev.map(r => r.key === row.key ? { ...r, used_qty: e.target.value } : r))}
                                className="text-base text-right tabular-nums"
                              />
                            </div>
                            <div>
                              <label htmlFor={`out-notes-${row.key}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {t('itemCols.notes')}
                              </label>
                              <Input
                                id={`out-notes-${row.key}`}
                                value={row.notes}
                                onChange={e => setOutRows(prev => prev.map(r => r.key === row.key ? { ...r, notes: e.target.value } : r))}
                                className="text-base"
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              )}
            </section>

            {/* notes */}
            <div>
              <label htmlFor="inv-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('fields.notes')}
              </label>
              <Textarea
                id="inv-notes"
                value={header.notes ?? ''}
                onChange={e => setHeader(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="text-base"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="min-h-[44px] cursor-pointer">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {editingId ? tc('save') : tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
