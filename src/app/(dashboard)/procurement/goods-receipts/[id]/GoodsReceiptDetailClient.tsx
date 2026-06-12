'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  ArrowLeft, Save, Send, Loader2, PackagePlus, Receipt, CopyX,
  ExternalLink, AlertTriangle, Ban, HandCoins,
} from 'lucide-react'
import { format } from 'date-fns'
import { ApprovalTimeline, type TimelineStep } from '@/components/procurement/ApprovalTimeline'
import { ApprovalActions } from '@/components/procurement/ApprovalActions'
import type { DocStatus } from '@/lib/procurement/doc-types'
import { GrStatusBadge } from '../StatusBadge'

// 進貨驗收單 detail: sectioned 43-column form (editable while draft), deposit
// block (auto-filled by PR→GR conversion, links back to the deposit request),
// invoice block, read-only receiving lines (pr_items of the source PR),
// approval timeline / actions, 轉入庫單・轉請款單 conversion buttons and
// 作廢並複製 with explicit downstream (AP / 入庫單) conflict guidance.

interface GrItem {
  id: string
  line_no: number | null
  product_code: string | null
  product_name: string | null
  spec: string | null
  unit: string | null
  unit_price: number | null
  quantity: number | null
  amount: number | null
  received_qty: number | null
  pending_qty: number | null
}

interface GrDoc extends Record<string, unknown> {
  id: string
  doc_no: string | null
  status: DocStatus
  pr_id: string | null
  pr: { id: string; doc_no: string | null } | { id: string; doc_no: string | null }[] | null
  created_at: string
  created_by_name: string | null
  updated_by_name: string | null
  receiver_name: string | null
  voided_by_name: string | null
}

interface GrDetail {
  doc: GrDoc
  items: GrItem[]
  deposit: { id: string; doc_no: string | null; status: string } | null
  steps: TimelineStep[]
  can_act: boolean
  current_step_kind: TimelineStep['approver_kind'] | null
  can_edit_vendor_code: boolean
}

type FieldKind = 'text' | 'number' | 'date' | 'datetime'

interface FieldDef { name: string; kind: FieldKind }

/** Form sections (43-column layout, deposit / invoice / items / notes rendered separately) */
const SECTIONS: { key: string; fields: FieldDef[] }[] = [
  {
    key: 'source',
    fields: [
      { name: 'requesting_department', kind: 'text' },
      { name: 'received_at', kind: 'datetime' },
      { name: 'inspected_at', kind: 'datetime' },
      { name: 'confirmed_inbound_at', kind: 'datetime' },
    ],
  },
  {
    key: 'vendor',
    fields: [
      { name: 'vendor_code', kind: 'text' },
      { name: 'vendor_name', kind: 'text' },
      { name: 'tax_id', kind: 'text' },
      { name: 'contact_person', kind: 'text' },
      { name: 'phone', kind: 'text' },
      { name: 'fax', kind: 'text' },
      { name: 'email', kind: 'text' },
    ],
  },
  {
    key: 'amounts',
    fields: [
      { name: 'tax_type', kind: 'text' },
      { name: 'tax_rate', kind: 'number' },
      { name: 'tax_amount', kind: 'number' },
      { name: 'subtotal', kind: 'number' },
      { name: 'shipping_fee', kind: 'number' },
      { name: 'total_amount', kind: 'number' },
    ],
  },
  {
    key: 'invoice',
    fields: [
      { name: 'invoice_no', kind: 'text' },
      { name: 'invoice_date', kind: 'date' },
      { name: 'invoice_doc_url', kind: 'text' },
      { name: 'shipping_doc_url', kind: 'text' },
    ],
  },
]

const ALL_FIELDS: FieldDef[] = [
  ...SECTIONS.flatMap(s => s.fields),
  { name: 'deposit_doc_no', kind: 'text' },
  { name: 'deposit_paid_amount', kind: 'number' },
]

const URL_FIELDS = new Set(['invoice_doc_url', 'shipping_doc_url'])

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** ISO timestamp → value for <input type="datetime-local"> */
function toDatetimeLocal(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : format(d, "yyyy-MM-dd'T'HH:mm")
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
      {children}
    </label>
  )
}

export function GoodsReceiptDetailClient({ id }: { id: string }) {
  const t = useTranslations('procurement.goodsReceipts')
  const tc = useTranslations('common')
  const router = useRouter()

  const [detail, setDetail] = useState<GrDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // draft form state
  const [form, setForm] = useState<Record<string, string>>({})
  const [hasDeposit, setHasDeposit] = useState(false)
  const [convertedToInspection, setConvertedToInspection] = useState(false)
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [converting, setConverting] = useState<'inbound_order' | 'ap_request' | null>(null)

  // void-and-clone dialog
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidClone, setVoidClone] = useState(true)
  const [voiding, setVoiding] = useState(false)
  const [downstreamDocs, setDownstreamDocs] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/procurement/goods-receipts/${id}`)
    const { data, error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    const d = data as GrDetail
    setDetail(d)
    // hydrate the draft form from the document
    const next: Record<string, string> = {}
    for (const f of ALL_FIELDS) {
      const v = d.doc[f.name]
      if (f.kind === 'datetime') next[f.name] = toDatetimeLocal(v)
      else if (v === null || v === undefined) next[f.name] = ''
      else next[f.name] = String(v)
    }
    setForm(next)
    setHasDeposit(d.doc.has_deposit === true)
    setConvertedToInspection(d.doc.converted_to_inspection === true)
    setNotes(typeof d.doc.notes === 'string' ? d.doc.notes : '')
  }, [id])

  useEffect(() => {
    // initial load — deferred to a microtask so no state is set synchronously
    // during the effect body (react-hooks/set-state-in-effect)
    queueMicrotask(load)
  }, [load])

  const doc = detail?.doc
  const isDraft = doc?.status === 'draft'
  const canEditVendorCode = detail?.can_edit_vendor_code ?? false
  const pr = doc ? one(doc.pr) : null

  const setField = (name: string, value: string) => setForm(prev => ({ ...prev, [name]: value }))

  const buildSaveBody = () => {
    const body: Record<string, unknown> = {
      has_deposit: hasDeposit,
      converted_to_inspection: convertedToInspection,
      notes,
    }
    for (const f of ALL_FIELDS) {
      if (f.name === 'vendor_code' && !canEditVendorCode) continue // spec rule 1: 唯讀
      const raw = form[f.name] ?? ''
      if (f.kind === 'datetime') body[f.name] = raw ? new Date(raw).toISOString() : null
      else body[f.name] = raw
    }
    if (!hasDeposit) {
      body.deposit_doc_no = null
      body.deposit_paid_amount = null
    }
    return body
  }

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch(`/api/procurement/goods-receipts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSaveBody()),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    toast.success(tc('saved'))
    load()
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    const res = await fetch(`/api/procurement/approvals/goods_receipt/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    })
    const { error } = await res.json()
    setSubmitting(false)
    if (error) { toast.error(error); return }
    toast.success(t('submitted'))
    load()
  }

  const handleConvert = async (toType: 'inbound_order' | 'ap_request') => {
    setConverting(toType)
    const res = await fetch('/api/procurement/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromType: 'goods_receipt', fromId: id, toType }),
    })
    const { data, error } = await res.json()
    setConverting(null)
    if (error) { toast.error(error); return }
    toast.success(t('convertSuccess', { docNo: data.doc_no ?? '' }))
  }

  const handleVoid = async () => {
    if (!voidReason.trim()) { toast.error(t('voidReasonRequired')); return }
    setVoiding(true)
    setDownstreamDocs(null)
    const res = await fetch(`/api/procurement/void/goods_receipt/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: voidReason.trim(), clone: voidClone }),
    })
    const json = await res.json()
    setVoiding(false)
    if (json.error) {
      // 409 with live downstream AP / inbound docs — keep the dialog open and
      // show the blocking doc numbers so the user can resolve them first.
      if (res.status === 409 && Array.isArray(json.downstream) && json.downstream.length > 0) {
        setDownstreamDocs(json.downstream as string[])
        return
      }
      toast.error(json.error)
      return
    }
    setVoidOpen(false)
    if (json.data?.clone_id) {
      toast.success(t('voidCloneCreated', { docNo: json.data.clone_doc_no ?? '' }))
      router.push(`/procurement/goods-receipts/${json.data.clone_id}`)
    } else {
      toast.success(t('voidSuccess', { docNo: json.data?.doc_no ?? '' }))
      load()
    }
  }

  const renderReadOnly = (f: FieldDef) => {
    const v = doc?.[f.name]
    if (v === null || v === undefined || v === '') return <p className="text-slate-700 dark:text-slate-300 mt-0.5">—</p>
    if (URL_FIELDS.has(f.name) && typeof v === 'string') {
      return (
        <a
          href={v}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline mt-0.5 break-all"
        >
          {t('viewFile')}
          <ExternalLink size={14} aria-hidden />
        </a>
      )
    }
    let text: string
    if (f.kind === 'datetime') text = format(new Date(v as string), 'yyyy-MM-dd HH:mm')
    else if (f.kind === 'number') text = Number(v).toLocaleString()
    else text = String(v)
    return <p className="text-slate-700 dark:text-slate-300 mt-0.5 break-words tabular-nums">{text}</p>
  }

  const renderField = (f: FieldDef) => {
    const vendorCodeLocked = f.name === 'vendor_code' && !canEditVendorCode
    if (!isDraft || vendorCodeLocked) {
      return (
        <div key={f.name}>
          <span className="text-sm text-slate-400">{t(`fields.${f.name}` as Parameters<typeof t>[0])}</span>
          {renderReadOnly(f)}
          {vendorCodeLocked && isDraft && (
            <p className="text-xs text-slate-400 mt-0.5">{t('vendorCodeReadonlyHint')}</p>
          )}
        </div>
      )
    }
    const inputType = f.kind === 'number' ? 'number'
      : f.kind === 'date' ? 'date'
      : f.kind === 'datetime' ? 'datetime-local'
      : 'text'
    return (
      <div key={f.name}>
        <FieldLabel htmlFor={`gr-${f.name}`}>{t(`fields.${f.name}` as Parameters<typeof t>[0])}</FieldLabel>
        <Input
          id={`gr-${f.name}`}
          type={inputType}
          inputMode={f.kind === 'number' ? 'decimal' : undefined}
          value={form[f.name] ?? ''}
          onChange={e => setField(f.name, e.target.value)}
          className="text-base"
        />
      </div>
    )
  }

  if (loading || !detail || !doc) {
    return <p className="text-sm text-slate-400 py-12 text-center">{tc('loading')}</p>
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header row: back link + doc no + status */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/procurement/goods-receipts"
          className="inline-flex items-center gap-1 min-h-[44px] text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft size={16} aria-hidden />
          {t('backToList')}
        </Link>
        <span className="font-semibold text-lg text-slate-900 dark:text-slate-100">{doc.doc_no ?? '—'}</span>
        <GrStatusBadge status={doc.status} />
      </div>

      {/* Voided banner */}
      {doc.status === 'voided' && (
        <div className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <Ban size={16} aria-hidden />
            {t('voidedTitle')}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-wrap">
            {typeof doc.void_reason === 'string' ? doc.void_reason : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {doc.voided_by_name ?? '—'}
            {typeof doc.voided_at === 'string' ? ` · ${format(new Date(doc.voided_at), 'yyyy-MM-dd HH:mm')}` : ''}
          </p>
        </div>
      )}

      {/* Meta (read-only source info) */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">{t('sections.source')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm mb-4">
          <div>
            <span className="text-slate-400">{t('fields.pr_doc_no')}</span>
            <p className="text-slate-700 dark:text-slate-300 mt-0.5">{pr?.doc_no ?? '—'}</p>
          </div>
          <div>
            <span className="text-slate-400">{t('fields.receiver')}</span>
            <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.receiver_name ?? '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {SECTIONS[0].fields.map(renderField)}
          {/* 已轉驗收 */}
          {isDraft ? (
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={convertedToInspection}
                onChange={e => setConvertedToInspection(e.target.checked)}
                className="h-5 w-5 rounded border-slate-300 dark:border-slate-600 accent-blue-600 cursor-pointer"
              />
              {t('fields.converted_to_inspection')}
            </label>
          ) : (
            <div className="text-sm">
              <span className="text-slate-400">{t('fields.converted_to_inspection')}</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                {doc.converted_to_inspection === true ? t('convertedYes') : '—'}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Vendor + amounts + invoice sections */}
      {SECTIONS.slice(1).map(section => (
        <section key={section.key} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
            {t(`sections.${section.key}` as Parameters<typeof t>[0])}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {section.fields.map(renderField)}
          </div>
        </section>
      ))}

      {/* Deposit block (訂金) — auto-filled by PR→GR conversion */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
          <HandCoins size={18} className="text-amber-600 dark:text-amber-400" aria-hidden />
          {t('sections.deposit')}
        </h3>
        {isDraft ? (
          <div className="space-y-3">
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={hasDeposit}
                onChange={e => setHasDeposit(e.target.checked)}
                className="h-5 w-5 rounded border-slate-300 dark:border-slate-600 accent-blue-600 cursor-pointer"
              />
              {t('fields.has_deposit')}
            </label>
            {hasDeposit && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <FieldLabel htmlFor="gr-deposit_doc_no">{t('fields.deposit_doc_no')}</FieldLabel>
                  <Input
                    id="gr-deposit_doc_no"
                    value={form.deposit_doc_no ?? ''}
                    onChange={e => setField('deposit_doc_no', e.target.value)}
                    className="text-base"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="gr-deposit_paid_amount">{t('fields.deposit_paid_amount')}</FieldLabel>
                  <Input
                    id="gr-deposit_paid_amount"
                    type="number"
                    inputMode="decimal"
                    value={form.deposit_paid_amount ?? ''}
                    onChange={e => setField('deposit_paid_amount', e.target.value)}
                    className="text-base"
                  />
                </div>
              </div>
            )}
          </div>
        ) : doc.has_deposit === true ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <span className="text-slate-400">{t('fields.deposit_doc_no')}</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                {typeof doc.deposit_doc_no === 'string' && doc.deposit_doc_no ? doc.deposit_doc_no : '—'}
              </p>
            </div>
            <div>
              <span className="text-slate-400">{t('fields.deposit_paid_amount')}</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5 tabular-nums">
                {doc.deposit_paid_amount !== null && doc.deposit_paid_amount !== undefined
                  ? Number(doc.deposit_paid_amount).toLocaleString()
                  : '—'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t('depositNone')}</p>
        )}

        {/* 來自訂金請款單 DEP-xxxx link (resolved from deposit_doc_no) */}
        {doc.has_deposit === true && detail.deposit && (
          <Link
            href={`/procurement/payments/deposit/${detail.deposit.id}`}
            className="inline-flex items-center gap-1 min-h-[44px] mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t('depositFrom', { docNo: detail.deposit.doc_no ?? '' })}
            <ExternalLink size={14} aria-hidden />
          </Link>
        )}
      </section>

      {/* Receiving lines (read-only, from the source PR's items) */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">{t('sections.items')}</h3>
        <p className="text-xs text-slate-400 mb-3">{t('itemsHint')}</p>
        {detail.items.length === 0 ? (
          <p className="text-sm text-slate-400">{t('itemsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  {(['line_no', 'product_code', 'product_name', 'spec', 'unit', 'unit_price', 'quantity', 'amount', 'received_qty', 'pending_qty'] as const).map(col => (
                    <th
                      key={col}
                      className={`px-3 py-2 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap ${
                        ['unit_price', 'quantity', 'amount', 'received_qty', 'pending_qty'].includes(col) ? 'text-right' : 'text-left'
                      }`}
                    >
                      {t(`itemCols.${col}` as Parameters<typeof t>[0])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {detail.items.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{item.line_no ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.product_code ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{item.product_name ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{item.spec ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.unit ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{item.unit_price !== null ? item.unit_price.toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-800 dark:text-slate-200 tabular-nums">{item.quantity !== null ? item.quantity.toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{item.amount !== null ? item.amount.toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{item.received_qty !== null ? item.received_qty.toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{item.pending_qty !== null ? item.pending_qty.toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">{t('sections.notes')}</h3>
        {isDraft ? (
          <Textarea
            id="gr-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="text-base"
            aria-label={t('fields.notes')}
          />
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {typeof doc.notes === 'string' && doc.notes ? doc.notes : '—'}
          </p>
        )}
      </section>

      {/* Primary actions */}
      {isDraft && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving || submitting} className="min-h-[44px] cursor-pointer">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {tc('save')}
          </Button>
          <Button
            variant="outline"
            onClick={handleSubmit}
            disabled={saving || submitting}
            className="min-h-[44px] cursor-pointer"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {t('submitForApproval')}
          </Button>
        </div>
      )}

      {doc.status === 'approved' && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => handleConvert('inbound_order')}
            disabled={converting !== null}
            className="min-h-[44px] cursor-pointer"
          >
            {converting === 'inbound_order' ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />}
            {t('convertToInbound')}
          </Button>
          <Button
            onClick={() => handleConvert('ap_request')}
            disabled={converting !== null}
            className="min-h-[44px] cursor-pointer"
          >
            {converting === 'ap_request' ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
            {t('convertToAp')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => { setDownstreamDocs(null); setVoidOpen(true) }}
            disabled={converting !== null}
            className="min-h-[44px] cursor-pointer"
          >
            <CopyX size={16} />
            {t('voidAndClone')}
          </Button>
        </div>
      )}

      {doc.status === 'rejected' && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            onClick={() => { setDownstreamDocs(null); setVoidOpen(true) }}
            className="min-h-[44px] cursor-pointer"
          >
            <CopyX size={16} />
            {t('voidAndClone')}
          </Button>
        </div>
      )}

      {/* Approval timeline + actions (確認 by 最後修改人員 → 確認 by anyone) */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <ApprovalTimeline docType="goods_receipt" steps={detail.steps} />
      </section>

      {detail.can_act && detail.current_step_kind && (
        <ApprovalActions
          docType="goods_receipt"
          docId={id}
          stepKind={detail.current_step_kind}
          onActed={load}
        />
      )}

      {/* Void-and-clone dialog */}
      <Dialog open={voidOpen} onOpenChange={open => { setVoidOpen(open); if (!open) setDownstreamDocs(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('voidTitle')}</DialogTitle>
          </DialogHeader>

          {/* 409: downstream AP / 入庫單 must be voided first — show their doc nos */}
          {downstreamDocs && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-300">
                <AlertTriangle size={16} aria-hidden />
                {t('voidDownstreamTitle')}
              </p>
              <ul className="mt-2 space-y-1">
                {downstreamDocs.map(docNo => (
                  <li key={docNo} className="text-sm font-medium text-red-700 dark:text-red-300 tabular-nums">
                    {docNo}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-red-700 dark:text-red-300/80 mt-2">{t('voidDownstreamHint')}</p>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <FieldLabel htmlFor="gr-void-reason">
                {t('voidReasonLabel')} <span className="text-red-500">*</span>
              </FieldLabel>
              <Textarea
                id="gr-void-reason"
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder={t('voidReasonPlaceholder')}
                rows={3}
                className="text-base"
              />
            </div>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={voidClone}
                onChange={e => setVoidClone(e.target.checked)}
                className="h-5 w-5 rounded border-slate-300 dark:border-slate-600 accent-blue-600 cursor-pointer"
              />
              {t('voidCloneLabel')}
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleVoid} disabled={voiding} className="min-h-[44px] cursor-pointer">
              {voiding ? <Loader2 size={16} className="animate-spin" /> : <CopyX size={16} />}
              {t('voidConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
