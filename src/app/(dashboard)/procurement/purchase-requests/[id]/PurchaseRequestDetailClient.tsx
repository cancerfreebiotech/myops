'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  ArrowLeft, Save, Send, Loader2, Plus, Trash2, PackagePlus,
  Banknote, Ban, Copy,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { ApprovalTimeline, type TimelineStep } from '@/components/procurement/ApprovalTimeline'
import { ApprovalActions } from '@/components/procurement/ApprovalActions'
import type { DocStatus } from '@/lib/procurement/doc-types'
import { PrStatusBadge, formatAmount } from '../PurchaseRequestsClient'

// 請採購單 detail — sectioned header form (廠商 / 金額 / 條件 / 日期) + pr_items
// editor with auto-computed line amounts + 小計/稅額/合計, submit through the
// 4-step chain (主管→COO→CEO→通知採購), shared ApprovalTimeline/ApprovalActions,
// 轉進貨單 / 訂金請款 (convert API) and 作廢並複製 (void API).

export interface UserOption { id: string; display_name: string | null }
export interface VendorOption {
  id: string
  vendor_code: string | null
  name: string
  tax_id: string | null
  contact_person: string | null
  phone: string | null
  fax: string | null
  contact_email: string | null
  full_billing_address: string | null
  payment_method: string | null
  payment_terms: string | null
  incoterms: string | null
}
export interface ProductOption {
  id: string
  product_code: string | null
  name: string
  spec: string | null
  purchase_unit: string | null
}

interface ItemRow {
  id: string | null
  product_id: string | null
  product_code: string
  product_name: string
  spec: string
  unit: string
  purchase_code: string
  unit_price: string
  quantity: string
  received_qty: number
  pending_qty: number | null
  /** local list key (new rows have no DB id yet) */
  key: string
}

interface Detail {
  doc: Record<string, unknown> & {
    id: string
    doc_no: string | null
    status: DocStatus
    created_at: string
    created_by_name: string | null
    purchaser_name: string | null
    voided_by_name: string | null
    gr_count: number | null
    deposit_request_count: number | null
    rfq: { id: string; doc_no: string | null } | { id: string; doc_no: string | null }[] | null
  }
  items: Record<string, unknown>[]
  steps: TimelineStep[]
  can_act: boolean
  current_step_kind: TimelineStep['approver_kind'] | null
}

/** Header text/date fields grouped into form sections (i18n: sections.* / fields.*) */
const HEADER_SECTIONS: { key: string; fields: { name: string; type: 'text' | 'date' | 'number' }[] }[] = [
  {
    key: 'basic',
    fields: [
      { name: 'purchase_date', type: 'date' },
      { name: 'requesting_department', type: 'text' },
      { name: 'urgency', type: 'text' },
    ],
  },
  {
    key: 'vendor',
    fields: [
      { name: 'vendor_code', type: 'text' },
      { name: 'vendor_name', type: 'text' },
      { name: 'tax_id', type: 'text' },
      { name: 'contact_person', type: 'text' },
      { name: 'phone', type: 'text' },
      { name: 'fax', type: 'text' },
      { name: 'email', type: 'text' },
      { name: 'address', type: 'text' },
      { name: 'delivery_address', type: 'text' },
    ],
  },
  {
    key: 'terms',
    fields: [
      { name: 'payment_method', type: 'text' },
      { name: 'payment_terms', type: 'text' },
      { name: 'incoterms', type: 'text' },
      { name: 'tax_type', type: 'text' },
    ],
  },
  {
    key: 'dates',
    fields: [
      { name: 'request_expected_date', type: 'date' },
      { name: 'required_delivery_date', type: 'date' },
      { name: 'expected_delivery_date', type: 'date' },
      { name: 'closed_date', type: 'date' },
    ],
  },
]

const HEADER_FIELDS = HEADER_SECTIONS.flatMap(s => s.fields.map(f => f.name))
  .concat(['tax_rate', 'shipping_fee', 'notes'])

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toNum(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

let localKeySeq = 0
function nextKey(): string {
  localKeySeq += 1
  return `local-${localKeySeq}`
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

interface Props {
  docId: string
  users: UserOption[]
  vendors: VendorOption[]
  products: ProductOption[]
}

export function PurchaseRequestDetailClient({ docId, users, vendors, products }: Props) {
  const t = useTranslations('procurement.purchaseRequests')
  const tc = useTranslations('common')
  const router = useRouter()

  const [detail, setDetail] = useState<Detail | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [items, setItems] = useState<ItemRow[]>([])

  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [converting, setConverting] = useState<'goods_receipt' | 'deposit_request' | null>(null)
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState<'void' | 'clone' | null>(null)
  const [pickerValue, setPickerValue] = useState('')
  const hydratedRef = useRef(false)

  const loadDetail = useCallback(async (hydrateForm: boolean) => {
    const res = await fetch(`/api/procurement/purchase-requests/${docId}`)
    const { data, error } = await res.json()
    if (error || !data) {
      setLoadFailed(true)
      if (error) toast.error(error)
      return
    }
    const d = data as Detail
    setDetail(d)
    if (hydrateForm || !hydratedRef.current) {
      hydratedRef.current = true
      const next: Record<string, string> = {}
      for (const f of HEADER_FIELDS) {
        const v = d.doc[f]
        next[f] = v === null || v === undefined ? '' : String(v)
      }
      next.purchaser_id = typeof d.doc.purchaser_id === 'string' ? d.doc.purchaser_id : ''
      next.vendor_id = typeof d.doc.vendor_id === 'string' ? d.doc.vendor_id : ''
      setForm(next)
      setItems(d.items.map(it => ({
        id: (it.id as string) ?? null,
        product_id: (it.product_id as string | null) ?? null,
        product_code: (it.product_code as string | null) ?? '',
        product_name: (it.product_name as string | null) ?? '',
        spec: (it.spec as string | null) ?? '',
        unit: (it.unit as string | null) ?? '',
        purchase_code: (it.purchase_code as string | null) ?? '',
        unit_price: it.unit_price === null || it.unit_price === undefined ? '' : String(it.unit_price),
        quantity: it.quantity === null || it.quantity === undefined ? '' : String(it.quantity),
        received_qty: (it.received_qty as number | null) ?? 0,
        pending_qty: (it.pending_qty as number | null) ?? null,
        key: (it.id as string) ?? nextKey(),
      })))
    }
  }, [docId])

  useEffect(() => {
    // initial load — deferred to a microtask so no state is set synchronously
    // during the effect body (react-hooks/set-state-in-effect)
    queueMicrotask(() => loadDetail(true))
  }, [loadDetail])

  const status = detail?.doc.status ?? null
  const editable = status === 'draft'

  // ── auto-computed totals: 金額 = 單價×數量, 小計 = Σ金額, 稅額 = 小計×稅率%, 合計 = 小計+稅額+運費 ──
  const lineAmount = (row: ItemRow): number | null => {
    const price = toNum(row.unit_price)
    const qty = toNum(row.quantity)
    return price !== null && qty !== null ? round2(price * qty) : null
  }
  const subtotal = useMemo(
    () => round2(items.reduce((sum, row) => sum + (lineAmount(row) ?? 0), 0)),
    [items]
  )
  const taxAmount = useMemo(
    () => round2(subtotal * ((toNum(form.tax_rate ?? '') ?? 0) / 100)),
    [subtotal, form.tax_rate]
  )
  const totalAmount = useMemo(
    () => round2(subtotal + taxAmount + (toNum(form.shipping_fee ?? '') ?? 0)),
    [subtotal, taxAmount, form.shipping_fee]
  )

  const setField = (name: string, value: string) => setForm(prev => ({ ...prev, [name]: value }))

  const handleVendorPick = (vendorId: string) => {
    setField('vendor_id', vendorId)
    const v = vendors.find(x => x.id === vendorId)
    if (!v) return
    setForm(prev => ({
      ...prev,
      vendor_id: vendorId,
      vendor_code: v.vendor_code ?? '',
      vendor_name: v.name,
      tax_id: v.tax_id ?? '',
      contact_person: v.contact_person ?? '',
      phone: v.phone ?? '',
      fax: v.fax ?? '',
      email: v.contact_email ?? '',
      address: v.full_billing_address ?? '',
      payment_method: v.payment_method ?? '',
      payment_terms: v.payment_terms ?? '',
      incoterms: v.incoterms ?? '',
    }))
  }

  const addProductRow = (productId: string) => {
    const p = products.find(x => x.id === productId)
    if (!p) return
    setItems(prev => [...prev, {
      id: null,
      product_id: p.id,
      product_code: p.product_code ?? '',
      product_name: p.name,
      spec: p.spec ?? '',
      unit: p.purchase_unit ?? '',
      purchase_code: '',
      unit_price: '',
      quantity: '1',
      received_qty: 0,
      pending_qty: null,
      key: nextKey(),
    }])
    setPickerValue('')
  }

  const addEmptyRow = () => {
    setItems(prev => [...prev, {
      id: null, product_id: null, product_code: '', product_name: '', spec: '',
      unit: '', purchase_code: '', unit_price: '', quantity: '',
      received_qty: 0, pending_qty: null, key: nextKey(),
    }])
  }

  const setItemField = (key: string, name: keyof ItemRow, value: string) => {
    setItems(prev => prev.map(row => row.key === key ? { ...row, [name]: value } : row))
  }

  const removeRow = (key: string) => setItems(prev => prev.filter(row => row.key !== key))

  const buildPayload = () => ({
    ...Object.fromEntries(HEADER_FIELDS.map(f => [f, form[f] ?? ''])),
    purchaser_id: form.purchaser_id ?? '',
    vendor_id: form.vendor_id ?? '',
    items: items.map((row, i) => ({
      ...(row.id ? { id: row.id } : {}),
      line_no: i + 1,
      product_id: row.product_id,
      product_code: row.product_code,
      product_name: row.product_name,
      spec: row.spec,
      unit: row.unit,
      purchase_code: row.purchase_code,
      unit_price: toNum(row.unit_price),
      quantity: toNum(row.quantity),
    })),
  })

  const handleSave = async (silent = false): Promise<boolean> => {
    setSaving(true)
    const res = await fetch(`/api/procurement/purchase-requests/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return false }
    if (!silent) toast.success(tc('saved'))
    await loadDetail(true)
    return true
  }

  const handleSubmitForApproval = async () => {
    if (items.length === 0) { toast.error(t('itemsRequired')); return }
    setSubmitting(true)
    const saved = await handleSave(true)
    if (!saved) { setSubmitting(false); return }
    const res = await fetch(`/api/procurement/approvals/purchase_request/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    })
    const { error } = await res.json()
    setSubmitting(false)
    if (error) { toast.error(error); return }
    toast.success(t('submitted'))
    loadDetail(true)
  }

  const handleConvert = async (toType: 'goods_receipt' | 'deposit_request') => {
    setConverting(toType)
    const res = await fetch('/api/procurement/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromType: 'purchase_request', fromId: docId, toType }),
    })
    const { data, error } = await res.json()
    setConverting(null)
    if (error) { toast.error(error); return }
    toast.success(t(toType === 'goods_receipt' ? 'convertGrSuccess' : 'convertDepositSuccess', { docNo: data.doc_no }))
    loadDetail(false)
  }

  const handleVoid = async (clone: boolean) => {
    if (!voidReason.trim()) { toast.error(t('voidReasonRequired')); return }
    setVoiding(clone ? 'clone' : 'void')
    const res = await fetch(`/api/procurement/void/purchase_request/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: voidReason.trim(), clone }),
    })
    const { data, error } = await res.json()
    setVoiding(null)
    if (error) { toast.error(error); return }
    setVoidOpen(false)
    setVoidReason('')
    if (clone && data.clone_id) {
      toast.success(t('voidCloneSuccess', { docNo: data.clone_doc_no ?? '' }))
      router.push(`/procurement/purchase-requests/${data.clone_id}`)
      return
    }
    toast.success(t('voided'))
    loadDetail(true)
  }

  if (loadFailed) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-slate-500 dark:text-slate-400">{t('loadFailed')}</p>
        <Link href="/procurement/purchase-requests" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
          <ArrowLeft size={16} />
          {t('backToList')}
        </Link>
      </div>
    )
  }

  if (!detail) {
    return <p className="text-sm text-slate-400 py-16 text-center">{tc('loading')}</p>
  }

  const doc = detail.doc
  const rfq = one(doc.rfq)
  const inputCls = 'text-base'

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <Link
            href="/procurement/purchase-requests"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <ArrowLeft size={16} />
            {t('backToList')}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{doc.doc_no ?? t('detailTitle')}</h1>
            <PrStatusBadge status={doc.status} />
            {typeof doc.fulfillment_status === 'string' && doc.fulfillment_status && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                {doc.fulfillment_status}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('metaLine', {
              creator: doc.created_by_name ?? '—',
              createdAt: format(new Date(doc.created_at), 'yyyy-MM-dd HH:mm'),
            })}
            {rfq?.doc_no ? ` · ${t('sourceRfq')}: ${rfq.doc_no}` : ''}
          </p>
        </div>

        {/* Primary actions */}
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              <Button variant="outline" onClick={() => handleSave()} disabled={saving || submitting} className="min-h-[44px] cursor-pointer">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {tc('save')}
              </Button>
              <Button onClick={handleSubmitForApproval} disabled={saving || submitting} className="min-h-[44px] cursor-pointer">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {t('submitForApproval')}
              </Button>
            </>
          )}
          {doc.status === 'approved' && (
            <>
              <Button onClick={() => handleConvert('goods_receipt')} disabled={converting !== null} className="min-h-[44px] cursor-pointer">
                {converting === 'goods_receipt' ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />}
                {t('convertToGr')}
              </Button>
              <Button variant="outline" onClick={() => handleConvert('deposit_request')} disabled={converting !== null} className="min-h-[44px] cursor-pointer">
                {converting === 'deposit_request' ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
                {t('convertToDeposit')}
              </Button>
            </>
          )}
          {(doc.status === 'approved' || doc.status === 'rejected') && (
            <Button variant="destructive" onClick={() => setVoidOpen(true)} className="min-h-[44px] cursor-pointer">
              <Ban size={16} />
              {t('voidAndClone')}
            </Button>
          )}
        </div>
      </div>

      {/* Voided banner */}
      {doc.status === 'voided' && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-300">
          {t('voidedBanner', {
            by: doc.voided_by_name ?? '—',
            reason: typeof doc.void_reason === 'string' && doc.void_reason ? doc.void_reason : '—',
          })}
        </div>
      )}

      {/* Downstream counts */}
      {(((doc.gr_count as number | null) ?? 0) > 0 || ((doc.deposit_request_count as number | null) ?? 0) > 0) && (
        <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
          <span>{t('grCount', { count: (doc.gr_count as number | null) ?? 0 })}</span>
          <span>{t('depositCount', { count: (doc.deposit_request_count as number | null) ?? 0 })}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: header form + items ── */}
        <div className="xl:col-span-2 space-y-6">
          {/* Header form */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6 space-y-6">
            {/* purchaser + vendor pickers */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('sections.basic')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pr-purchaser" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('fields.purchaser_id')}
                  </label>
                  <Select value={form.purchaser_id ?? ''} onValueChange={v => setField('purchaser_id', v ?? '')} disabled={!editable}>
                    <SelectTrigger id="pr-purchaser" className="min-h-[44px] w-full">
                      <SelectValue placeholder={t('purchaserPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name ?? u.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {HEADER_SECTIONS[0].fields.map(f => (
                  <div key={f.name}>
                    <label htmlFor={`pr-${f.name}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t(`fields.${f.name}` as Parameters<typeof t>[0])}
                    </label>
                    <Input
                      id={`pr-${f.name}`}
                      type={f.type === 'date' ? 'date' : 'text'}
                      value={form[f.name] ?? ''}
                      onChange={e => setField(f.name, e.target.value)}
                      disabled={!editable}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* vendor */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('sections.vendor')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="pr-vendor" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('fields.vendor_id')}
                  </label>
                  <Select value={form.vendor_id ?? ''} onValueChange={v => handleVendorPick(v ?? '')} disabled={!editable}>
                    <SelectTrigger id="pr-vendor" className="min-h-[44px] w-full">
                      <SelectValue placeholder={t('vendorPickerPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.vendor_code ? `${v.vendor_code} · ${v.name}` : v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {HEADER_SECTIONS[1].fields.map(f => (
                  <div key={f.name} className={f.name === 'address' || f.name === 'delivery_address' ? 'sm:col-span-2' : undefined}>
                    <label htmlFor={`pr-${f.name}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t(`fields.${f.name}` as Parameters<typeof t>[0])}
                    </label>
                    <Input
                      id={`pr-${f.name}`}
                      value={form[f.name] ?? ''}
                      onChange={e => setField(f.name, e.target.value)}
                      disabled={!editable}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* terms */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('sections.terms')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {HEADER_SECTIONS[2].fields.map(f => (
                  <div key={f.name}>
                    <label htmlFor={`pr-${f.name}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t(`fields.${f.name}` as Parameters<typeof t>[0])}
                    </label>
                    <Input
                      id={`pr-${f.name}`}
                      value={form[f.name] ?? ''}
                      onChange={e => setField(f.name, e.target.value)}
                      disabled={!editable}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* dates */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('sections.dates')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {HEADER_SECTIONS[3].fields.map(f => (
                  <div key={f.name}>
                    <label htmlFor={`pr-${f.name}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t(`fields.${f.name}` as Parameters<typeof t>[0])}
                    </label>
                    <Input
                      id={`pr-${f.name}`}
                      type="date"
                      value={form[f.name] ?? ''}
                      onChange={e => setField(f.name, e.target.value)}
                      disabled={!editable}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* notes */}
            <section>
              <label htmlFor="pr-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('fields.notes')}
              </label>
              <Textarea
                id="pr-notes"
                value={form.notes ?? ''}
                onChange={e => setField('notes', e.target.value)}
                disabled={!editable}
                rows={3}
                className={inputCls}
              />
            </section>
          </div>

          {/* ── Items editor ── */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">{t('itemsTitle')}</h3>
              {editable && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={pickerValue} onValueChange={v => { if (v) addProductRow(v) }}>
                    <SelectTrigger className="min-h-[44px] w-[240px]">
                      <SelectValue placeholder={t('productPickerPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.product_code ? `${p.product_code} · ${p.name}` : p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={addEmptyRow} className="min-h-[44px] cursor-pointer">
                    <Plus size={16} />
                    {t('addEmptyRow')}
                  </Button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-sm min-w-[960px]">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium text-slate-600 dark:text-slate-400 w-10">{t('itemCols.lineNo')}</th>
                    <th className="text-left px-2 py-2 font-medium text-slate-600 dark:text-slate-400 min-w-[110px]">{t('itemCols.productCode')}</th>
                    <th className="text-left px-2 py-2 font-medium text-slate-600 dark:text-slate-400 min-w-[180px]">{t('itemCols.productName')}</th>
                    <th className="text-left px-2 py-2 font-medium text-slate-600 dark:text-slate-400 min-w-[140px]">{t('itemCols.spec')}</th>
                    <th className="text-left px-2 py-2 font-medium text-slate-600 dark:text-slate-400 min-w-[90px]">{t('itemCols.unit')}</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 dark:text-slate-400 min-w-[110px]">{t('itemCols.unitPrice')}</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 dark:text-slate-400 min-w-[90px]">{t('itemCols.quantity')}</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 dark:text-slate-400 min-w-[110px]">{t('itemCols.amount')}</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 dark:text-slate-400 min-w-[80px]">{t('itemCols.receivedQty')}</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 dark:text-slate-400 min-w-[80px]">{t('itemCols.pendingQty')}</th>
                    {editable && <th className="px-2 py-2 w-12" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={editable ? 11 : 10} className="text-center py-8 text-slate-400">
                        {t('noItems')}
                      </td>
                    </tr>
                  ) : items.map((row, i) => {
                    const amount = lineAmount(row)
                    const pendingQty = row.id
                      ? (toNum(row.quantity) !== null ? round2((toNum(row.quantity) as number) - row.received_qty) : row.pending_qty)
                      : toNum(row.quantity)
                    return (
                      <tr key={row.key} className="align-top">
                        <td className="px-2 py-2 text-slate-500 tabular-nums">{i + 1}</td>
                        {editable ? (
                          <>
                            <td className="px-2 py-2">
                              <label htmlFor={`item-code-${row.key}`} className="sr-only">{t('itemCols.productCode')}</label>
                              <Input id={`item-code-${row.key}`} value={row.product_code} onChange={e => setItemField(row.key, 'product_code', e.target.value)} className="text-base min-w-[100px]" />
                            </td>
                            <td className="px-2 py-2">
                              <label htmlFor={`item-name-${row.key}`} className="sr-only">{t('itemCols.productName')}</label>
                              <Input id={`item-name-${row.key}`} value={row.product_name} onChange={e => setItemField(row.key, 'product_name', e.target.value)} className="text-base min-w-[170px]" />
                            </td>
                            <td className="px-2 py-2">
                              <label htmlFor={`item-spec-${row.key}`} className="sr-only">{t('itemCols.spec')}</label>
                              <Input id={`item-spec-${row.key}`} value={row.spec} onChange={e => setItemField(row.key, 'spec', e.target.value)} className="text-base min-w-[130px]" />
                            </td>
                            <td className="px-2 py-2">
                              <label htmlFor={`item-unit-${row.key}`} className="sr-only">{t('itemCols.unit')}</label>
                              <Input id={`item-unit-${row.key}`} value={row.unit} onChange={e => setItemField(row.key, 'unit', e.target.value)} className="text-base min-w-[80px]" />
                            </td>
                            <td className="px-2 py-2">
                              <label htmlFor={`item-price-${row.key}`} className="sr-only">{t('itemCols.unitPrice')}</label>
                              <Input id={`item-price-${row.key}`} type="number" inputMode="decimal" min="0" value={row.unit_price} onChange={e => setItemField(row.key, 'unit_price', e.target.value)} className="text-base text-right min-w-[100px] tabular-nums" />
                            </td>
                            <td className="px-2 py-2">
                              <label htmlFor={`item-qty-${row.key}`} className="sr-only">{t('itemCols.quantity')}</label>
                              <Input id={`item-qty-${row.key}`} type="number" inputMode="decimal" min="0" value={row.quantity} onChange={e => setItemField(row.key, 'quantity', e.target.value)} className="text-base text-right min-w-[80px] tabular-nums" />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.product_code || '—'}</td>
                            <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.product_name || '—'}</td>
                            <td className="px-2 py-2 text-slate-600 dark:text-slate-400">{row.spec || '—'}</td>
                            <td className="px-2 py-2 text-slate-600 dark:text-slate-400">{row.unit || '—'}</td>
                            <td className="px-2 py-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">{row.unit_price || '—'}</td>
                            <td className="px-2 py-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">{row.quantity || '—'}</td>
                          </>
                        )}
                        <td className="px-2 py-2 text-right text-slate-800 dark:text-slate-200 font-medium tabular-nums whitespace-nowrap">
                          {amount !== null ? formatAmount(amount) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{row.received_qty}</td>
                        <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{pendingQty ?? '—'}</td>
                        {editable && (
                          <td className="px-2 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRow(row.key)}
                              aria-label={t('removeRow')}
                              className="min-h-[44px] min-w-[44px] text-red-600 hover:text-red-700 cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex flex-col items-end gap-2 border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="grid grid-cols-[auto_minmax(120px,auto)] gap-x-6 gap-y-1.5 text-sm items-center">
                <span className="text-slate-500 dark:text-slate-400">{t('fields.subtotal')}</span>
                <span className="text-right text-slate-800 dark:text-slate-200 tabular-nums">{formatAmount(subtotal)}</span>

                <label htmlFor="pr-tax_rate" className="text-slate-500 dark:text-slate-400">{t('fields.tax_rate')}</label>
                <div className="flex justify-end">
                  <Input
                    id="pr-tax_rate"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={form.tax_rate ?? ''}
                    onChange={e => setField('tax_rate', e.target.value)}
                    disabled={!editable}
                    className="text-base text-right w-[110px] tabular-nums"
                  />
                </div>

                <span className="text-slate-500 dark:text-slate-400">{t('fields.tax_amount')}</span>
                <span className="text-right text-slate-800 dark:text-slate-200 tabular-nums">{formatAmount(taxAmount)}</span>

                <label htmlFor="pr-shipping_fee" className="text-slate-500 dark:text-slate-400">{t('fields.shipping_fee')}</label>
                <div className="flex justify-end">
                  <Input
                    id="pr-shipping_fee"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={form.shipping_fee ?? ''}
                    onChange={e => setField('shipping_fee', e.target.value)}
                    disabled={!editable}
                    className="text-base text-right w-[110px] tabular-nums"
                  />
                </div>

                <span className="font-semibold text-slate-800 dark:text-slate-200">{t('fields.total_amount')}</span>
                <span className={cn('text-right font-semibold text-lg tabular-nums', 'text-slate-900 dark:text-slate-100')}>
                  {formatAmount(totalAmount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: approval ── */}
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6">
            <ApprovalTimeline docType="purchase_request" steps={detail.steps} docStatus={doc.status} />
          </div>
          {detail.can_act && detail.current_step_kind && (
            <ApprovalActions
              docType="purchase_request"
              docId={docId}
              stepKind={detail.current_step_kind}
              onActed={() => loadDetail(true)}
            />
          )}
        </div>
      </div>

      {/* Void (作廢 / 作廢並複製) dialog */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('voidDialogTitle', { docNo: doc.doc_no ?? '' })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('voidDialogHint')}</p>
          <div>
            <label htmlFor="void-reason" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('voidReason')} <span className="text-red-500">*</span>
            </label>
            <Textarea
              id="void-reason"
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              placeholder={t('voidReasonPlaceholder')}
              rows={3}
              className="text-base"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)} disabled={voiding !== null} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={() => handleVoid(false)} disabled={voiding !== null} className="min-h-[44px] cursor-pointer">
              {voiding === 'void' ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
              {t('voidOnly')}
            </Button>
            <Button variant="destructive" onClick={() => handleVoid(true)} disabled={voiding !== null} className="min-h-[44px] cursor-pointer">
              {voiding === 'clone' ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
              {t('voidAndClone')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
