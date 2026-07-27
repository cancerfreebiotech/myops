'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, PackageCheck, Pencil, Send, Trash2, Undo2 } from 'lucide-react'
import { format } from 'date-fns'
import { ApprovalTimeline } from '@/components/procurement/ApprovalTimeline'
import { ApprovalActions } from '@/components/procurement/ApprovalActions'
import { BackLink } from '@/components/procurement/BackLink'
import { InvStatusBadge } from '../../InvStatusBadge'
import {
  InventoryFormDialog,
  nextFormRowKey,
  type InventoryFormSeed,
} from '../../InventoryFormDialog'
import {
  formatQty,
  one,
  type Direction,
  type InboundItemRow,
  type InboundListRow,
  type OrderDetail,
  type OutboundItemRow,
  type ProductOption,
  type StockRow,
  type WarehouseOption,
} from '../../types'

// 入庫單 / 出庫單明細 — 表頭欄位、明細表、簽核時間軸／簽核動作，以及
// 編輯（草稿限定，共用列表頁的表單）／送簽／過帳／沖銷過帳／刪除。
// 所有動作後重新載入單據；server 端會再次檢查狀態與權限。

type DetailState =
  | { direction: 'inbound'; data: OrderDetail<InboundItemRow> }
  | { direction: 'outbound'; data: OrderDetail<OutboundItemRow> }

interface Props {
  direction: Direction
  docId: string
  warehouses: WarehouseOption[]
  products: ProductOption[]
  stocks: StockRow[]
}

export function InventoryDetailClient({ direction, docId, warehouses, products, stocks }: Props) {
  const t = useTranslations('procurement.inventory')
  const tc = useTranslations('common')
  const router = useRouter()

  const [detail, setDetail] = useState<DetailState | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [acting, setActing] = useState<'submit' | 'post' | 'unpost' | 'delete' | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [unpostConfirmOpen, setUnpostConfirmOpen] = useState(false)
  const [formSeed, setFormSeed] = useState<InventoryFormSeed | null>(null)

  const docType = direction === 'inbound' ? 'inbound_order' : 'outbound_order'

  const load = useCallback(async () => {
    const res = await fetch(`/api/procurement/${direction}/${docId}`)
    const { data, error } = await res.json()
    if (error || !data) {
      setLoadFailed(true)
      toast.error(error ?? t('loadFailed'))
      return
    }
    setDetail({ direction, data } as DetailState)
  }, [direction, docId, t])

  useEffect(() => {
    // initial load — deferred to a microtask so no state is set synchronously
    // during the effect body (react-hooks/set-state-in-effect)
    queueMicrotask(load)
  }, [load])

  // ── 編輯（草稿限定）— 與列表頁「新增」共用同一個表單 ──

  const openEdit = () => {
    if (!detail) return
    const doc = detail.data.doc
    if (detail.direction === 'inbound') {
      const gr = one(doc.gr as InboundListRow['gr'])
      setFormSeed({
        direction: 'inbound',
        editingId: doc.id,
        header: {
          gr_doc_no: gr?.doc_no ?? '',
          order_date: typeof doc.order_date === 'string' ? doc.order_date : '',
          notes: typeof doc.notes === 'string' ? doc.notes : '',
        },
        inRows: detail.data.items.map(it => ({
          key: it.id || nextFormRowKey(),
          product_id: it.product_id ?? '',
          warehouse_id: it.warehouse_id ?? '',
          lot_no: it.lot_no ?? '',
          expiry_date: it.expiry_date ?? '',
          quantity: String(it.quantity),
          notes: it.notes ?? '',
        })),
        outRows: [],
      })
      return
    }
    setFormSeed({
      direction: 'outbound',
      editingId: doc.id,
      header: {
        order_date: typeof doc.order_date === 'string' ? doc.order_date : '',
        shipment_no: typeof doc.shipment_no === 'string' ? doc.shipment_no : '',
        notes: typeof doc.notes === 'string' ? doc.notes : '',
      },
      inRows: [],
      outRows: detail.data.items.map(it => ({
        key: it.id || nextFormRowKey(),
        warehouse_stock_id: it.warehouse_stock_id ?? '',
        used_qty: String(it.used_qty),
        notes: it.notes ?? '',
      })),
    })
  }

  // ── document actions (server re-checks status + permissions) ──

  const handleSubmitForApproval = async () => {
    setActing('submit')
    const res = await fetch(`/api/procurement/approvals/${docType}/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    })
    const { error } = await res.json()
    setActing(null)
    if (error) { toast.error(error); return }
    toast.success(t('submitted'))
    load()
    router.refresh() // 清掉 router cache，返回列表時才看得到新狀態
  }

  /** 庫存過帳 / 沖銷過帳 — atomic SECURITY DEFINER fns behind the API */
  const handlePostAction = async (action: 'post' | 'unpost') => {
    setActing(action)
    const res = await fetch(`/api/procurement/${direction}/${docId}/${action}`, { method: 'POST' })
    const { error } = await res.json()
    setActing(null)
    setUnpostConfirmOpen(false)
    if (error) { toast.error(error); return }
    toast.success(action === 'post' ? t('postSuccess') : t('unpostSuccess'))
    load()
    router.refresh() // re-pull warehouse_stock / products server props
  }

  const handleDelete = async () => {
    setActing('delete')
    const res = await fetch(`/api/procurement/${direction}/${docId}`, { method: 'DELETE' })
    const { error } = await res.json()
    setActing(null)
    setDeleteConfirmOpen(false)
    if (error) { toast.error(error); return }
    toast.success(t('deleted'))
    router.push(`/procurement/inventory?tab=${direction}`)
    router.refresh() // 單據已刪除，列表必須重新向 server 取
  }

  if (loadFailed) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-slate-500 dark:text-slate-400">{t('loadFailed')}</p>
        <BackLink fallbackHref={`/procurement/inventory?tab=${direction}`} />
      </div>
    )
  }

  if (!detail) {
    return <p className="text-sm text-slate-400 py-16 text-center">{tc('loading')}</p>
  }

  const doc = detail.data.doc
  const isPosted = !!doc.posted_at

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <BackLink fallbackHref={`/procurement/inventory?tab=${direction}`} />
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {doc.doc_no ?? t(`detailTitle.${direction}`)}
            </h1>
            <InvStatusBadge status={doc.status} />
            {isPosted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-medium bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                <PackageCheck size={12} aria-hidden />
                {t('postedBadge')}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t(`detailTitle.${direction}`)} · {doc.created_by_name ?? '—'} · {format(new Date(doc.created_at), 'yyyy-MM-dd HH:mm')}
          </p>
        </div>

        {/* Primary actions — server re-validates status & permissions */}
        <div className="flex flex-wrap gap-2">
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

      {/* 表頭資訊 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6 space-y-5">
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
      </div>

      {/* 明細 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{t('itemsTitle')}</h3>
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
      </div>

      {/* Approval timeline + actions */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6 space-y-5">
        <ApprovalTimeline docType={docType} steps={detail.data.steps} docStatus={doc.status} />
        {detail.data.can_act && detail.data.current_step_kind && (
          <ApprovalActions
            docType={docType}
            docId={docId}
            stepKind={detail.data.current_step_kind}
            onActed={() => { load(); router.refresh() }}
          />
        )}
      </div>

      {/* delete draft confirm */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('deleteConfirmTitle', { docNo: doc.doc_no ?? '' })}</DialogTitle>
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
            <DialogTitle>{t('unpostConfirmTitle', { docNo: doc.doc_no ?? '' })}</DialogTitle>
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

      {/* 編輯草稿 — 與列表頁「新增」共用同一個表單元件 */}
      {formSeed && (
        <InventoryFormDialog
          seed={formSeed}
          warehouses={warehouses}
          products={products}
          stocks={stocks}
          onClose={() => setFormSeed(null)}
          onSaved={() => { setFormSeed(null); load(); router.refresh() }}
        />
      )}
    </div>
  )
}
