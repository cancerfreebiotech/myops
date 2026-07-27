'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import BarcodeScanner from '@/components/procurement/BarcodeScanner'
import {
  formatQty,
  lookupCode,
  one,
  type Direction,
  type ProductOption,
  type StockRow,
  type WarehouseOption,
} from './types'

// 入庫單 / 出庫單的建立＋編輯表單（草稿限定）— 列表頁的「新增」與明細頁的「編輯」共用。
// 只在開啟時掛載（parent 以 seed 是否存在控制），內部狀態直接由 seed 初始化，
// 因此每次重新開啟都是乾淨的表單。

export interface InboundFormRow {
  key: string
  product_id: string
  warehouse_id: string
  lot_no: string
  expiry_date: string
  quantity: string
  notes: string
}

export interface OutboundFormRow {
  key: string
  warehouse_stock_id: string
  used_qty: string
  notes: string
}

/** 表單初始值；editingId 有值＝編輯既有草稿 (PUT)，null＝新增 (POST)。 */
export interface InventoryFormSeed {
  direction: Direction
  editingId: string | null
  header: Record<string, string>
  inRows: InboundFormRow[]
  outRows: OutboundFormRow[]
}

let localKeySeq = 0
export function nextFormRowKey(): string {
  localKeySeq += 1
  return `local-${localKeySeq}`
}

function toPositive(s: string): number | null {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
}

/** 新增用的空白表單（單據日期預設今天） */
export function createFormSeed(direction: Direction): InventoryFormSeed {
  return {
    direction,
    editingId: null,
    header: { order_date: format(new Date(), 'yyyy-MM-dd') },
    inRows: [],
    outRows: [],
  }
}

interface Props {
  seed: InventoryFormSeed
  warehouses: WarehouseOption[]
  products: ProductOption[]
  stocks: StockRow[]
  onClose: () => void
  /** 存檔成功後由 parent 重新載入列表／明細並關閉表單 */
  onSaved: () => void
}

export function InventoryFormDialog({ seed, warehouses, products, stocks, onClose, onSaved }: Props) {
  const t = useTranslations('procurement.inventory')
  const tc = useTranslations('common')

  const { direction, editingId } = seed
  const [header, setHeader] = useState<Record<string, string>>(seed.header)
  const [inRows, setInRows] = useState<InboundFormRow[]>(seed.inRows)
  const [outRows, setOutRows] = useState<OutboundFormRow[]>(seed.outRows)
  const [saving, setSaving] = useState(false)

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const stockById = useMemo(() => new Map(stocks.map(s => [s.id, s])), [stocks])

  const stockOptionLabel = (s: StockRow): string => {
    const parts = [s.stock_code ?? '—', s.product_name ?? s.product_code ?? '—']
    if (s.lot_no) parts.push(s.lot_no)
    const wh = one(s.warehouse)
    if (wh) parts.push(wh.name)
    return `${parts.join(' · ')} (${formatQty(s.quantity)})`
  }

  const buildPayload = (): Record<string, unknown> | null => {
    if (direction === 'inbound') {
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
    const itemCount = direction === 'inbound' ? inRows.length : outRows.length
    if (itemCount === 0) { toast.error(t('itemsRequired')); return }
    const payload = buildPayload()
    if (payload === null) { toast.error(t('errors.itemInvalid')); return }
    setSaving(true)
    const url = editingId
      ? `/api/procurement/${direction}/${editingId}`
      : `/api/procurement/${direction}`
    const res = await fetch(url, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    toast.success(editingId ? tc('saved') : t('created'))
    onSaved()
  }

  // ── scanning into the form (連掃累加) ──

  const handleFormScan = async (code: string) => {
    try {
      const result = await lookupCode(code)
      const product = result?.product
      if (!result || !product) { toast.error(t('errors.codeNotFound')); return }
      if (direction === 'inbound') {
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
            key: nextFormRowKey(),
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
          return [...prev, { key: nextFormRowKey(), warehouse_stock_id: stock.id, used_qty: '1', notes: '' }]
        })
      }
    } catch {
      toast.error(t('loadFailed'))
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t(`formTitle.${editingId ? 'edit' : 'create'}${direction === 'inbound' ? 'Inbound' : 'Outbound'}` as Parameters<typeof t>[0])}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {direction === 'inbound' ? (
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
                    if (direction === 'inbound') {
                      setInRows(prev => [...prev, {
                        key: nextFormRowKey(), product_id: '', warehouse_id: warehouses[0]?.id ?? '',
                        lot_no: '', expiry_date: '', quantity: '1', notes: '',
                      }])
                    } else {
                      setOutRows(prev => [...prev, { key: nextFormRowKey(), warehouse_stock_id: '', used_qty: '1', notes: '' }])
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

            {direction === 'inbound' ? (
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
                                {stocks.map(s => (
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
          <Button variant="outline" onClick={onClose} disabled={saving} className="min-h-[44px] cursor-pointer">
            {tc('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="min-h-[44px] cursor-pointer">
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {editingId ? tc('save') : tc('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
