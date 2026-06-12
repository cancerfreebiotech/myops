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
import { ArrowLeft, FileText, Landmark, Loader2, Paperclip, Pencil, Plus, Send } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { ApprovalTimeline, type TimelineStep } from '@/components/procurement/ApprovalTimeline'
import { ApprovalActions } from '@/components/procurement/ApprovalActions'
import type { DocStatus } from '@/lib/procurement/doc-types'
import { PAYMENT_DOC_TYPE, PaymentStatusBadge, formatAmount, type PaymentKind } from '../../PaymentsClient'

// 請款單詳情 — kind-specific sections:
// - deposit: 銀行匯款資訊區 (從廠商主檔帶入) + 要求匯款期限
// - ap: 「是否分期」=true 時的分期區塊 (已分期總額/期數/各期列表) + 建立分期請款 (AP→INS convert)
// - installment: 期數/請款月份/金額/發票號碼/發票檔案上傳 (procurement bucket)
// All three approve through the shared single finance step (ApprovalTimeline + ApprovalActions).

type FieldType = 'text' | 'number' | 'date' | 'textarea'

interface FieldDef {
  name: string
  type: FieldType
  required?: boolean
}

interface SectionDef {
  key: string
  fields: FieldDef[]
}

/** Read-only vendor identity columns (carried from the source doc / vendors master) */
const VENDOR_DISPLAY: Record<PaymentKind, string[]> = {
  deposit: ['vendor_code', 'vendor_name', 'vendor_short_name'],
  ap: ['vendor_code', 'vendor_name', 'country', 'tax_id'],
  installment: [],
}

const BANK_FIELDS: FieldDef[] = [
  { name: 'bank_name', type: 'text' },
  { name: 'bank_branch', type: 'text' },
  { name: 'bank_swift_code', type: 'text' },
  { name: 'bank_account_no', type: 'text' },
  { name: 'bank_account_name', type: 'text' },
]

const SECTIONS: Record<PaymentKind, SectionDef[]> = {
  deposit: [
    { key: 'amounts', fields: [
      { name: 'deposit_amount', type: 'number' },
      { name: 'total_amount', type: 'number' },
    ] },
    { key: 'remittance', fields: [
      { name: 'remittance_deadline', type: 'date', required: true }, // 要求匯款期限
      { name: 'remittance_date', type: 'date' },
      { name: 'remittance_month', type: 'text' },
      { name: 'closing_day', type: 'text' },
    ] },
    { key: 'bank', fields: BANK_FIELDS },
  ],
  ap: [
    { key: 'amounts', fields: [
      { name: 'ap_total_amount', type: 'number' },
      { name: 'amount_adjustment', type: 'number' },
      { name: 'total_amount', type: 'number' },
      { name: 'adjustment_notes', type: 'textarea' },
    ] },
    { key: 'payment', fields: [
      { name: 'billing_month', type: 'text' },
      { name: 'payment_method', type: 'text' },
      { name: 'payment_terms', type: 'text' },
      { name: 'closing_day', type: 'text' },
      { name: 'remittance_deadline', type: 'date' },
    ] },
    { key: 'bank', fields: BANK_FIELDS },
  ],
  installment: [
    { key: 'invoice', fields: [
      { name: 'billing_month', type: 'text' },
      { name: 'amount', type: 'number' },
      { name: 'invoice_no', type: 'text' },
      { name: 'invoice_date', type: 'date' },
    ] },
  ],
}

interface DocRef { id: string; doc_no: string | null }
type MaybeArray<T> = T | T[] | null

function one<T>(v: MaybeArray<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

interface InstallmentItem {
  id: string
  doc_no: string | null
  status: DocStatus
  installment_no: number | null
  billing_month: string | null
  amount: number | null
  invoice_no: string | null
}

interface DetailData {
  doc: Record<string, unknown> & {
    id: string
    doc_no: string | null
    status: DocStatus
    created_at: string
    created_by_name: string | null
    voided_by_name?: string | null
  }
  steps: TimelineStep[]
  can_act: boolean
  current_step_kind: TimelineStep['approver_kind'] | null
  installments?: InstallmentItem[]
  installment_total?: number
}

interface Props {
  kind: PaymentKind
  id: string
}

export function PaymentDetailClient({ kind, id }: Props) {
  const t = useTranslations('procurement.payments')
  const tc = useTranslations('common')
  const router = useRouter()

  const [detail, setDetail] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [isInstallmentFlag, setIsInstallmentFlag] = useState(false)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [converting, setConverting] = useState(false)
  const [openingFile, setOpeningFile] = useState(false)

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/procurement/payments/${kind}/${id}`)
    const { data, error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    setDetail(data)
  }, [kind, id])

  useEffect(() => {
    // initial load — deferred to a microtask so no state is set synchronously
    // during the effect body (react-hooks/set-state-in-effect)
    queueMicrotask(loadDetail)
  }, [loadDetail])

  const doc = detail?.doc
  const sections = SECTIONS[kind]
  const formFields = sections.flatMap(s => s.fields)

  const str = (name: string): string => {
    const v = doc?.[name]
    return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
  }

  const displayValue = (f: FieldDef): string => {
    const v = doc?.[f.name]
    if (v == null || v === '') return '—'
    if (f.type === 'number') return formatAmount(Number(v))
    return String(v)
  }

  const openEdit = () => {
    if (!doc) return
    const next: Record<string, string> = {}
    for (const f of formFields) next[f.name] = str(f.name)
    next.notes = str('notes')
    setForm(next)
    setIsInstallmentFlag(doc.is_installment === true)
    setInvoiceFile(null)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (kind === 'deposit' && !form.remittance_deadline) {
      toast.error(t('remittanceDeadlineRequired'))
      return
    }
    setSaving(true)

    const body: Record<string, unknown> = {}
    for (const f of formFields) body[f.name] = form[f.name] ?? ''
    body.notes = form.notes ?? ''
    if (kind === 'ap') body.is_installment = isInstallmentFlag

    // 發票檔案 → procurement bucket via presigned upload
    if (kind === 'installment' && invoiceFile) {
      const presignedRes = await fetch('/api/procurement/payments/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: invoiceFile.name }),
      })
      const { data: presigned, error: presignedError } = await presignedRes.json()
      if (presignedError || !presigned) { toast.error(t('uploadLinkError')); setSaving(false); return }
      const uploadRes = await fetch(presigned.signedUrl, {
        method: 'PUT',
        body: invoiceFile,
        headers: { 'Content-Type': invoiceFile.type || 'application/octet-stream' },
      })
      if (!uploadRes.ok) { toast.error(t('fileUploadError')); setSaving(false); return }
      body.invoice_file_url = presigned.path
    }

    const res = await fetch(`/api/procurement/payments/${kind}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    toast.success(tc('saved'))
    setFormOpen(false)
    loadDetail()
  }

  const handleSubmitForApproval = async () => {
    setSubmitting(true)
    const res = await fetch(`/api/procurement/approvals/${PAYMENT_DOC_TYPE[kind]}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    })
    const { error } = await res.json()
    setSubmitting(false)
    if (error) { toast.error(error); return }
    toast.success(t('submitted'))
    loadDetail()
  }

  // 建立分期請款 — AP→INS conversion (規格規則 1; source must be approved)
  const handleCreateInstallment = async () => {
    setConverting(true)
    const res = await fetch('/api/procurement/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromType: 'ap_request', fromId: id, toType: 'installment_request' }),
    })
    const { data, error } = await res.json()
    setConverting(false)
    if (error) { toast.error(error); return }
    toast.success(t('installmentCreated', { docNo: data.doc_no }))
    router.push(`/procurement/payments/installment/${data.id}`)
  }

  const handleViewInvoice = async () => {
    const path = str('invoice_file_url')
    if (!path) return
    setOpeningFile(true)
    const res = await fetch(`/api/procurement/payments/file?path=${encodeURIComponent(path)}`)
    const { data, error } = await res.json()
    setOpeningFile(false)
    if (error || !data?.url) { toast.error(error ?? t('fileUploadError')); return }
    window.open(data.url, '_blank', 'noopener')
  }

  if (loading || !doc) {
    return <p className="text-sm text-slate-400 py-10 text-center">{tc('loading')}</p>
  }

  const sourceDoc: { label: string; ref: DocRef | null } =
    kind === 'deposit'
      ? { label: t('sourcePr'), ref: one(doc.pr as MaybeArray<DocRef>) }
      : kind === 'ap'
        ? { label: t('sourceGr'), ref: one(doc.gr as MaybeArray<DocRef>) }
        : { label: t('sourceAp'), ref: one(doc.ap as MaybeArray<DocRef>) }

  const vendorFields = VENDOR_DISPLAY[kind]
  const isDraft = doc.status === 'draft'
  const installments = detail?.installments ?? []

  return (
    <div className="max-w-7xl space-y-4">
      <Link
        href="/procurement/payments"
        className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
      >
        <ArrowLeft size={16} aria-hidden />
        {t('backToList')}
      </Link>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{doc.doc_no ?? '—'}</span>
          <PaymentStatusBadge status={doc.status} />
          {kind === 'installment' && doc.installment_no != null && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
              {t('installmentNoValue', { no: doc.installment_no as number })}
            </span>
          )}
        </div>

        {/* Void notice */}
        {doc.status === 'voided' && (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
            {t('voidedNotice', { reason: typeof doc.void_reason === 'string' && doc.void_reason ? doc.void_reason : '—' })}
          </div>
        )}

        {/* Meta */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <span className="text-slate-400">{sourceDoc.label}</span>
            <p className="text-slate-700 dark:text-slate-300 mt-0.5">{sourceDoc.ref?.doc_no ?? '—'}</p>
          </div>
          <div>
            <span className="text-slate-400">{t('creator')}</span>
            <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.created_by_name ?? '—'}</p>
          </div>
          <div>
            <span className="text-slate-400">{t('createdAt')}</span>
            <p className="text-slate-700 dark:text-slate-300 mt-0.5">{format(new Date(doc.created_at), 'yyyy-MM-dd HH:mm')}</p>
          </div>
        </div>

        {/* Vendor identity */}
        {vendorFields.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('sections.vendor')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {vendorFields.map(f => (
                <div key={f}>
                  <span className="text-slate-400">{t(`fields.${f}` as Parameters<typeof t>[0])}</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5 break-words">{str(f) || '—'}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Kind-specific sections */}
        {sections.map(section => (
          <section key={section.key}>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {section.key === 'bank' && <Landmark size={16} className="text-slate-400" aria-hidden />}
              {t(`sections.${section.key}` as Parameters<typeof t>[0])}
            </h3>
            {section.key === 'bank' && (
              <p className="text-xs text-slate-400 mb-2">{t('bankFromVendor')}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {section.fields.map(f => (
                <div key={f.name}>
                  <span className="text-slate-400">{t(`fields.${f.name}` as Parameters<typeof t>[0])}</span>
                  <p className={cn('text-slate-700 dark:text-slate-300 mt-0.5 break-words', f.type === 'number' && 'tabular-nums')}>
                    {displayValue(f)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* AP: 是否分期 + 分期區塊 */}
        {kind === 'ap' && (
          <section>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('sections.installments')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm mb-3">
              <div>
                <span className="text-slate-400">{t('fields.is_installment')}</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                  {doc.is_installment === true ? t('yes') : t('no')}
                </p>
              </div>
              {doc.is_installment === true && (
                <>
                  <div>
                    <span className="text-slate-400">{t('installmentTotal')}</span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5 tabular-nums">{formatAmount(detail?.installment_total ?? 0)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">{t('installmentCount')}</span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5 tabular-nums">
                      {installments.filter(i => i.status !== 'voided').length}
                    </p>
                  </div>
                </>
              )}
            </div>

            {doc.is_installment === true && (
              <div className="space-y-3">
                {installments.length === 0 ? (
                  <p className="text-sm text-slate-400">{t('noInstallments')}</p>
                ) : (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('docNo')}</th>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('installmentNo')}</th>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('fields.billing_month')}</th>
                          <th className="text-right px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('fields.amount')}</th>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('fields.invoice_no')}</th>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">{t('statusColumn')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {installments.map(ins => (
                          <tr
                            key={ins.id}
                            onClick={() => router.push(`/procurement/payments/installment/${ins.id}`)}
                            className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{ins.doc_no ?? '—'}</td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 tabular-nums">{ins.installment_no ?? '—'}</td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{ins.billing_month ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">{formatAmount(ins.amount)}</td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{ins.invoice_no ?? '—'}</td>
                            <td className="px-4 py-2.5"><PaymentStatusBadge status={ins.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {doc.status === 'approved' && (
                  <Button onClick={handleCreateInstallment} disabled={converting} className="min-h-[44px] cursor-pointer">
                    {converting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {t('createInstallment')}
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        {/* Installment: 發票檔案 */}
        {kind === 'installment' && (
          <section>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              <Paperclip size={16} className="text-slate-400" aria-hidden />
              {t('fields.invoice_file')}
            </h3>
            {str('invoice_file_url') ? (
              <Button variant="outline" onClick={handleViewInvoice} disabled={openingFile} className="min-h-[44px] cursor-pointer">
                {openingFile ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {t('viewInvoice')}
              </Button>
            ) : (
              <p className="text-sm text-slate-400">{t('noInvoiceFile')}</p>
            )}
          </section>
        )}

        {/* Notes */}
        {str('notes') && (
          <div className="text-sm">
            <span className="text-slate-400">{t('fields.notes')}</span>
            <p className="text-slate-700 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">{str('notes')}</p>
          </div>
        )}

        {/* Draft actions */}
        {isDraft && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openEdit} className="min-h-[44px] cursor-pointer">
              <Pencil size={16} />
              {tc('edit')}
            </Button>
            <Button onClick={handleSubmitForApproval} disabled={submitting} className="min-h-[44px] cursor-pointer">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {t('submitForApproval')}
            </Button>
          </div>
        )}

        {/* Approval timeline + actions (single finance step for all three kinds) */}
        <ApprovalTimeline docType={PAYMENT_DOC_TYPE[kind]} steps={detail?.steps ?? []} docStatus={doc.status} />

        {detail?.can_act && detail.current_step_kind && (
          <ApprovalActions
            docType={PAYMENT_DOC_TYPE[kind]}
            docId={id}
            stepKind={detail.current_step_kind}
            onActed={loadDetail}
          />
        )}
      </div>

      {/* Edit dialog (drafts only) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('editTitle')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {sections.map(section => (
              <section key={section.key}>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t(`sections.${section.key}` as Parameters<typeof t>[0])}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {section.fields.map(f => (
                    <div key={f.name} className={cn(f.type === 'textarea' && 'sm:col-span-2')}>
                      <label htmlFor={`pay-${f.name}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t(`fields.${f.name}` as Parameters<typeof t>[0])}
                        {f.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      {f.type === 'textarea' ? (
                        <Textarea
                          id={`pay-${f.name}`}
                          value={form[f.name] ?? ''}
                          onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                          rows={2}
                          className="text-base"
                        />
                      ) : (
                        <Input
                          id={`pay-${f.name}`}
                          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                          inputMode={f.type === 'number' ? 'decimal' : undefined}
                          value={form[f.name] ?? ''}
                          onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                          className="text-base"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* AP: 是否分期 */}
            {kind === 'ap' && (
              <div>
                <label htmlFor="pay-is-installment" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('fields.is_installment')}
                </label>
                <select
                  id="pay-is-installment"
                  value={isInstallmentFlag ? 'yes' : 'no'}
                  onChange={e => setIsInstallmentFlag(e.target.value === 'yes')}
                  className="w-full min-h-[44px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base text-slate-900 dark:text-slate-100 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600 outline-none"
                >
                  <option value="no">{t('no')}</option>
                  <option value="yes">{t('yes')}</option>
                </select>
              </div>
            )}

            {/* Installment: 發票檔案上傳 */}
            {kind === 'installment' && (
              <div>
                <label htmlFor="pay-invoice-file" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('uploadInvoice')}
                </label>
                <Input
                  id="pay-invoice-file"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={e => setInvoiceFile(e.target.files?.[0] ?? null)}
                  className="text-base cursor-pointer"
                />
                {str('invoice_file_url') && !invoiceFile && (
                  <p className="text-xs text-slate-400 mt-1">{t('invoiceAlreadyUploaded')}</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="pay-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('fields.notes')}
              </label>
              <Textarea
                id="pay-notes"
                value={form.notes ?? ''}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="text-base"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="min-h-[44px] cursor-pointer">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
