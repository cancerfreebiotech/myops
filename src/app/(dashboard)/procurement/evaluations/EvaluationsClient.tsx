'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Send, Loader2, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { ApprovalTimeline, type TimelineStep } from '@/components/procurement/ApprovalTimeline'
import { ApprovalActions } from '@/components/procurement/ApprovalActions'
import type { DocStatus, DocType } from '@/lib/procurement/doc-types'

// 審核評估單 — two tabs (vendor / product evaluations): list + create form +
// 送簽 (submit for approval) + detail dialog with the shared approval timeline.

type EvalType = 'vendor' | 'product'

const EVAL_DOC_TYPE: Record<EvalType, DocType> = {
  vendor: 'vendor_evaluation',
  product: 'product_evaluation',
}

interface NamedRef { id: string; display_name: string | null }
type MaybeArray<T> = T | T[] | null

function one<T>(v: MaybeArray<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export interface VendorEvalRow {
  id: string
  doc_no: string | null
  status: DocStatus
  current_step: number | null
  name: string | null
  short_name: string | null
  vendor_category: string | null
  created_at: string
  created_by: string | null
  created_by_user: MaybeArray<NamedRef>
}

export interface ProductEvalRow {
  id: string
  doc_no: string | null
  status: DocStatus
  current_step: number | null
  rfq_id: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  rfq: MaybeArray<{ id: string; doc_no: string | null }>
  created_by_user: MaybeArray<NamedRef>
}

interface EvalDetail {
  doc: Record<string, unknown> & {
    id: string
    doc_no: string | null
    status: DocStatus
    created_at: string
    created_by_name: string | null
  }
  steps: TimelineStep[]
  can_act: boolean
  current_step_kind: TimelineStep['approver_kind'] | null
}

/** Vendor-master form fields grouped into sections (i18n: sections.* / fields.*) */
const VENDOR_SECTIONS: { key: string; fields: string[] }[] = [
  { key: 'basic', fields: ['name', 'short_name', 'vendor_category', 'country', 'tax_id', 'phone', 'fax'] },
  { key: 'contact', fields: ['contact_person', 'contact_phone', 'contact_mobile', 'contact_email'] },
  { key: 'accounting', fields: ['accounting_contact', 'accounting_phone', 'accounting_mobile', 'accounting_email'] },
  { key: 'address', fields: ['billing_postal_code', 'billing_city_district', 'street_address', 'full_billing_address'] },
  { key: 'payment', fields: ['payment_method', 'payment_terms', 'closing_day', 'incoterms'] },
  { key: 'bank', fields: ['bank_name', 'bank_branch', 'bank_swift_code', 'bank_account_no', 'bank_account_name'] },
  { key: 'other', fields: ['paid_in_capital', 'last_year_revenue', 'filling_department'] },
]

const VENDOR_FIELDS = VENDOR_SECTIONS.flatMap(s => s.fields)

const STATUS_STYLE: Record<DocStatus, string> = {
  draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  in_approval: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
  approved: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  rejected: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  voided: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
}

function EvalStatusBadge({ status }: { status: DocStatus }) {
  const t = useTranslations('procurement.evaluations')
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap', STATUS_STYLE[status])}>
      {t(`statusLabels.${status}` as Parameters<typeof t>[0])}
    </span>
  )
}

interface Props {
  initialVendorEvaluations: VendorEvalRow[]
  initialProductEvaluations: ProductEvalRow[]
}

export function EvaluationsClient({ initialVendorEvaluations, initialProductEvaluations }: Props) {
  const t = useTranslations('procurement.evaluations')
  const tc = useTranslations('common')
  const [tab, setTab] = useState<EvalType>('vendor')
  const [vendorRows, setVendorRows] = useState<VendorEvalRow[]>(initialVendorEvaluations)
  const [productRows, setProductRows] = useState<ProductEvalRow[]>(initialProductEvaluations)

  // create / edit form
  const [formOpen, setFormOpen] = useState(false)
  const [formType, setFormType] = useState<EvalType>('vendor')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [vendorForm, setVendorForm] = useState<Record<string, string>>({})
  const [vendorNotes, setVendorNotes] = useState('')
  const [rfqDocNo, setRfqDocNo] = useState('')
  const [productNotes, setProductNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // detail dialog
  const [detailRef, setDetailRef] = useState<{ type: EvalType; id: string } | null>(null)
  const [detail, setDetail] = useState<EvalDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const refreshList = useCallback(async (type: EvalType) => {
    const res = await fetch(`/api/procurement/evaluations/${type}`)
    const { data, error } = await res.json()
    if (error) { toast.error(error); return }
    if (type === 'vendor') setVendorRows(data ?? [])
    else setProductRows(data ?? [])
  }, [])

  const loadDetail = useCallback(async (type: EvalType, id: string) => {
    setDetailLoading(true)
    const res = await fetch(`/api/procurement/evaluations/${type}/${id}`)
    const { data, error } = await res.json()
    setDetailLoading(false)
    if (error) { toast.error(error); return }
    setDetail(data)
  }, [])

  const openDetail = (type: EvalType, id: string) => {
    setDetailRef({ type, id })
    setDetail(null)
    loadDetail(type, id)
  }

  const closeDetail = () => { setDetailRef(null); setDetail(null) }

  const openCreate = (type: EvalType) => {
    setFormType(type)
    setEditingId(null)
    setVendorForm({})
    setVendorNotes('')
    setRfqDocNo('')
    setProductNotes('')
    setFormOpen(true)
  }

  const openEdit = () => {
    if (!detailRef || !detail) return
    setFormType(detailRef.type)
    setEditingId(detail.doc.id)
    if (detailRef.type === 'vendor') {
      const next: Record<string, string> = {}
      for (const f of VENDOR_FIELDS) {
        const v = detail.doc[f]
        if (typeof v === 'string') next[f] = v
      }
      setVendorForm(next)
      setVendorNotes(typeof detail.doc.notes === 'string' ? detail.doc.notes : '')
    } else {
      const rfq = one(detail.doc.rfq as MaybeArray<{ doc_no: string | null }>)
      setRfqDocNo(rfq?.doc_no ?? '')
      setProductNotes(typeof detail.doc.notes === 'string' ? detail.doc.notes : '')
    }
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (formType === 'vendor' && !vendorForm.name?.trim()) {
      toast.error(t('nameRequired'))
      return
    }
    setSaving(true)
    const body = formType === 'vendor'
      ? { ...vendorForm, notes: vendorNotes }
      : { rfq_doc_no: rfqDocNo, notes: productNotes }
    const url = editingId
      ? `/api/procurement/evaluations/${formType}/${editingId}`
      : `/api/procurement/evaluations/${formType}`
    const res = await fetch(url, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    toast.success(editingId ? tc('saved') : t('created'))
    setFormOpen(false)
    refreshList(formType)
    if (editingId && detailRef) loadDetail(detailRef.type, detailRef.id)
  }

  const handleSubmitForApproval = async (type: EvalType, id: string) => {
    setSubmittingId(id)
    const res = await fetch(`/api/procurement/approvals/${EVAL_DOC_TYPE[type]}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    })
    const { error } = await res.json()
    setSubmittingId(null)
    if (error) { toast.error(error); return }
    toast.success(t('submitted'))
    refreshList(type)
    if (detailRef?.id === id) loadDetail(type, id)
  }

  const onActed = () => {
    if (!detailRef) return
    loadDetail(detailRef.type, detailRef.id)
    refreshList(detailRef.type)
  }

  const rows = tab === 'vendor' ? vendorRows : productRows

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {([
            { key: 'vendor' as const, label: t('tabVendor') },
            { key: 'product' as const, label: t('tabProduct') },
          ]).map(item => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'px-4 py-2 min-h-[44px] text-sm font-medium border-b-2 transition-colors cursor-pointer',
                tab === item.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Button onClick={() => openCreate(tab)} className="min-h-[44px] cursor-pointer">
          <Plus size={16} />
          {tab === 'vendor' ? t('newVendor') : t('newProduct')}
        </Button>
      </div>

      {/* List */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('docNo')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">
                {tab === 'vendor' ? t('vendorName') : t('sourceRfq')}
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('statusColumn')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('creator')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('createdAt')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-400">
                  {t('noRecords')}
                </td>
              </tr>
            ) : rows.map(r => {
              const creator = one(r.created_by_user)
              const label = tab === 'vendor'
                ? (r as VendorEvalRow).name ?? '—'
                : one((r as ProductEvalRow).rfq)?.doc_no ?? '—'
              return (
                <tr
                  key={r.id}
                  onClick={() => openDetail(tab, r.id)}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.doc_no ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{label}</td>
                  <td className="px-4 py-3"><EvalStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{creator?.display_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{format(new Date(r.created_at), 'yyyy-MM-dd')}</td>
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

      {/* Create / edit form dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t('editTitle')
                : formType === 'vendor' ? t('newVendor') : t('newProduct')}
            </DialogTitle>
          </DialogHeader>

          {formType === 'vendor' ? (
            <div className="space-y-5">
              {VENDOR_SECTIONS.map(section => (
                <section key={section.key}>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    {t(`sections.${section.key}` as Parameters<typeof t>[0])}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {section.fields.map(f => (
                      <div key={f}>
                        <label htmlFor={`vendor-${f}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {t(`fields.${f}` as Parameters<typeof t>[0])}
                          {f === 'name' && <span className="text-red-500 ml-0.5">*</span>}
                        </label>
                        <Input
                          id={`vendor-${f}`}
                          value={vendorForm[f] ?? ''}
                          onChange={e => setVendorForm(prev => ({ ...prev, [f]: e.target.value }))}
                          className="text-base"
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              <div>
                <label htmlFor="vendor-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('fields.notes')}
                </label>
                <Textarea id="vendor-notes" value={vendorNotes} onChange={e => setVendorNotes(e.target.value)} rows={3} className="text-base" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="product-rfq" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('sourceRfq')}
                </label>
                <Input
                  id="product-rfq"
                  value={rfqDocNo}
                  onChange={e => setRfqDocNo(e.target.value)}
                  placeholder={t('sourceRfqPlaceholder')}
                  className="text-base"
                />
              </div>
              <div>
                <label htmlFor="product-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('fields.notes')}
                </label>
                <Textarea id="product-notes" value={productNotes} onChange={e => setProductNotes(e.target.value)} rows={3} className="text-base" />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="min-h-[44px] cursor-pointer">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {editingId ? tc('save') : tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={detailRef !== null} onOpenChange={open => { if (!open) closeDetail() }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailRef?.type === 'vendor' ? t('vendorDetailTitle') : t('productDetailTitle')}
            </DialogTitle>
          </DialogHeader>

          {detailLoading || !detail ? (
            <p className="text-sm text-slate-400 py-8 text-center">{tc('loading')}</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900 dark:text-slate-100">{detail.doc.doc_no ?? '—'}</span>
                <EvalStatusBadge status={detail.doc.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">{t('creator')}</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5">{detail.doc.created_by_name ?? '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">{t('createdAt')}</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5">{format(new Date(detail.doc.created_at), 'yyyy-MM-dd HH:mm')}</p>
                </div>
                {detailRef?.type === 'product' && (
                  <div>
                    <span className="text-slate-400">{t('sourceRfq')}</span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                      {one(detail.doc.rfq as MaybeArray<{ doc_no: string | null }>)?.doc_no ?? '—'}
                    </p>
                  </div>
                )}
              </div>

              {detailRef?.type === 'vendor' && (
                <div className="space-y-4">
                  {VENDOR_SECTIONS.map(section => {
                    const filled = section.fields.filter(f => typeof detail.doc[f] === 'string' && detail.doc[f])
                    if (filled.length === 0) return null
                    return (
                      <section key={section.key}>
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          {t(`sections.${section.key}` as Parameters<typeof t>[0])}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          {filled.map(f => (
                            <div key={f}>
                              <span className="text-slate-400">{t(`fields.${f}` as Parameters<typeof t>[0])}</span>
                              <p className="text-slate-700 dark:text-slate-300 mt-0.5 break-words">{detail.doc[f] as string}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}

              {typeof detail.doc.notes === 'string' && detail.doc.notes && (
                <div className="text-sm">
                  <span className="text-slate-400">{t('fields.notes')}</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">{detail.doc.notes}</p>
                </div>
              )}

              {detail.doc.status === 'draft' && detailRef && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={openEdit} className="min-h-[44px] cursor-pointer">
                    <Pencil size={16} />
                    {tc('edit')}
                  </Button>
                  <Button
                    onClick={() => handleSubmitForApproval(detailRef.type, detailRef.id)}
                    disabled={submittingId === detailRef.id}
                    className="min-h-[44px] cursor-pointer"
                  >
                    {submittingId === detailRef.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {t('submitForApproval')}
                  </Button>
                </div>
              )}

              {detailRef && (
                <ApprovalTimeline docType={EVAL_DOC_TYPE[detailRef.type]} steps={detail.steps} docStatus={detail.doc.status} />
              )}

              {detailRef && detail.can_act && detail.current_step_kind && (
                <ApprovalActions
                  docType={EVAL_DOC_TYPE[detailRef.type]}
                  docId={detailRef.id}
                  stepKind={detail.current_step_kind}
                  onActed={onActed}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
