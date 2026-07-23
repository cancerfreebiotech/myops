'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowRightLeft, CopyX, Loader2, Pencil, Send } from 'lucide-react'
import { format } from 'date-fns'
import { ApprovalTimeline, type TimelineStep } from '@/components/procurement/ApprovalTimeline'
import { ApprovalActions } from '@/components/procurement/ApprovalActions'
import { BackLink } from '@/components/procurement/BackLink'
import type { DocStatus } from '@/lib/procurement/doc-types'
import {
  RFQ_FORM_FIELDS,
  RFQ_SECTIONS,
  RfqForm,
  RfqStatusBadge,
  type UserOption,
} from '../shared'

// 詢價單詳情: sectioned read view + edit form (簽核中欄位鎖定 honoured via the
// API's locked_fields), 送簽, shared approval timeline / actions, 轉採購單
// (convert → jump to the new PR draft) and 作廢並複製 (void + clone, only for
// approved / rejected documents — spec §三-1 rule 1).

interface RfqDoc extends Record<string, unknown> {
  id: string
  doc_no: string | null
  status: DocStatus
  current_step: number | null
  pr_count: number | null
  product_eval_count: number | null
  void_reason: string | null
  voided_at: string | null
  created_at: string
  created_by_name: string | null
  requester_name: string | null
  inquirer_name: string | null
  reviewer_name: string | null
  voided_by_name: string | null
}

interface LinkedPr {
  id: string
  doc_no: string | null
  status: DocStatus
  vendor_name: string | null
  total_amount: number | null
  fulfillment_status: string | null
  purchase_date: string | null
}
interface PrItem {
  pr_id: string
  line_no: number | null
  product_code: string | null
  product_name: string | null
  spec: string | null
  unit: string | null
  unit_price: number | null
  quantity: number | null
  amount: number | null
}
interface Quote {
  vendor_name: string | null
  product_code: string | null
  product_name: string | null
  spec: string | null
  unit: string | null
  unit_price: number | null
  quote_date: string | null
}

interface RfqDetail {
  doc: RfqDoc
  steps: TimelineStep[]
  can_act: boolean
  current_step_kind: TimelineStep['approver_kind'] | null
  locked_fields: string[]
  linked_purchase_requests: LinkedPr[]
  pr_items: PrItem[]
  quotes: Quote[]
}

const USER_FIELD_NAME: Record<string, keyof RfqDoc> = {
  requester_id: 'requester_name',
  inquirer_id: 'inquirer_name',
  reviewer_id: 'reviewer_name',
}

interface Props {
  rfqId: string
  users: UserOption[]
}

export function RfqDetailClient({ rfqId, users }: Props) {
  const router = useRouter()
  const t = useTranslations('procurement.rfqs')
  const tc = useTranslations('common')
  const tItem = useTranslations('procurement.purchaseRequests.itemCols')

  const [detail, setDetail] = useState<RfqDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [converting, setConverting] = useState(false)

  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  // loading starts true; refreshes after actions just swap the data in place
  const load = useCallback(async () => {
    const res = await fetch(`/api/procurement/rfqs/${rfqId}`)
    const { data, error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    setDetail(data)
  }, [rfqId])

  useEffect(() => {
    // initial load — deferred to a microtask so no state is set synchronously
    // during the effect body (react-hooks/set-state-in-effect)
    queueMicrotask(load)
  }, [load])

  const openEdit = () => {
    if (!detail) return
    const next: Record<string, string> = {}
    for (const f of RFQ_FORM_FIELDS) {
      const v = detail.doc[f]
      if (typeof v === 'string') next[f] = v
    }
    setForm(next)
    setEditOpen(true)
  }

  const handleSave = async () => {
    if (!detail) return
    // Locked fields are disabled in the form; don't send them at all
    const body: Record<string, string> = {}
    for (const [k, v] of Object.entries(form)) {
      if (!detail.locked_fields.includes(k)) body[k] = v
    }
    setSaving(true)
    const res = await fetch(`/api/procurement/rfqs/${rfqId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    toast.success(tc('saved'))
    setEditOpen(false)
    load()
  }

  const handleSubmitForApproval = async () => {
    setSubmitting(true)
    const res = await fetch(`/api/procurement/approvals/rfq/${rfqId}`, {
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

  // 轉採購單 — creates a PR draft from this approved RFQ, then jumps to it
  const handleConvert = async () => {
    setConverting(true)
    const res = await fetch('/api/procurement/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromType: 'rfq', fromId: rfqId, toType: 'purchase_request' }),
    })
    const { data, error } = await res.json()
    setConverting(false)
    if (error) { toast.error(error); return }
    toast.success(t('convertSuccess', { docNo: data.doc_no ?? '' }))
    router.push(`/procurement/purchase-requests/${data.id}`)
  }

  // 作廢並複製此詢價單 — void + clone into a fresh draft, then jump to the clone
  const handleVoidClone = async () => {
    if (!voidReason.trim()) { toast.error(t('voidReasonRequired')); return }
    setVoiding(true)
    const res = await fetch(`/api/procurement/void/rfq/${rfqId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: voidReason.trim(), clone: true }),
    })
    const { data, error } = await res.json()
    setVoiding(false)
    if (error) { toast.error(error); return }
    setVoidOpen(false)
    setVoidReason('')
    toast.success(t('voidCloneSuccess', { docNo: data.clone_doc_no ?? '' }))
    if (data.clone_id) router.push(`/procurement/rfqs/${data.clone_id}`)
    else load()
  }

  if (loading || !detail) {
    return <p className="text-sm text-slate-400 py-16 text-center">{tc('loading')}</p>
  }

  const { doc, steps, can_act, current_step_kind, locked_fields, linked_purchase_requests, pr_items, quotes } = detail
  const canEdit = doc.status === 'draft' || doc.status === 'in_approval'
  const canVoidClone = doc.status === 'approved' || doc.status === 'rejected'
  const fmtAmount = (n: number | null) => (n == null ? '—' : `NT$ ${Number(n).toLocaleString('en-US')}`)

  const displayValue = (name: string, kind: string): string => {
    if (kind === 'user') {
      const v = doc[USER_FIELD_NAME[name]]
      return typeof v === 'string' && v ? v : '—'
    }
    const v = doc[name]
    return typeof v === 'string' && v ? v : '—'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <BackLink fallbackHref="/procurement/rfqs" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t('detailTitle')} {doc.doc_no ?? ''}
          </h1>
          <RfqStatusBadge status={doc.status} />
        </div>

        {/* Primary actions per status */}
        <div className="flex flex-wrap gap-2">
          {doc.status === 'draft' && (
            <>
              <Button variant="outline" onClick={openEdit} className="min-h-[44px] cursor-pointer">
                <Pencil size={16} />
                {tc('edit')}
              </Button>
              <Button onClick={handleSubmitForApproval} disabled={submitting} className="min-h-[44px] cursor-pointer">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {t('submitForApproval')}
              </Button>
            </>
          )}
          {doc.status === 'in_approval' && (
            <Button variant="outline" onClick={openEdit} className="min-h-[44px] cursor-pointer">
              <Pencil size={16} />
              {tc('edit')}
            </Button>
          )}
          {doc.status === 'approved' && (
            <Button onClick={handleConvert} disabled={converting} className="min-h-[44px] cursor-pointer">
              {converting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />}
              {t('convertToPr')}
            </Button>
          )}
          {canVoidClone && (
            <Button variant="destructive" onClick={() => setVoidOpen(true)} className="min-h-[44px] cursor-pointer">
              <CopyX size={16} />
              {t('voidAndClone')}
            </Button>
          )}
        </div>
      </div>

      {/* Voided banner */}
      {doc.status === 'voided' && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-600 dark:text-slate-400">
          <p className="font-medium text-slate-700 dark:text-slate-300">{t('voidedBanner')}</p>
          <p className="mt-1">
            {t('voidReasonLabel')}: {doc.void_reason ?? '—'}
            {doc.voided_by_name ? ` · ${doc.voided_by_name}` : ''}
            {doc.voided_at ? ` · ${format(new Date(doc.voided_at), 'yyyy-MM-dd HH:mm')}` : ''}
          </p>
        </div>
      )}

      {/* Document fields (read view, sectioned) */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6 space-y-5">
        {RFQ_SECTIONS.map(section => (
          <section key={section.key}>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {t(`sections.${section.key}` as Parameters<typeof t>[0])}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {section.fields.map(f => (
                <div key={f.name}>
                  <span className="text-slate-400">{t(`fields.${f.name}` as Parameters<typeof t>[0])}</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5 break-words whitespace-pre-wrap">
                    {displayValue(f.name, f.kind)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* System info */}
        <section>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('sections.system')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-slate-400">{t('prCount')}</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5 tabular-nums">{doc.pr_count ?? 0}</p>
            </div>
            <div>
              <span className="text-slate-400">{t('productEvalCount')}</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5 tabular-nums">{doc.product_eval_count ?? 0}</p>
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
        </section>
      </div>

      {/* 品項與數量（依採購單分組） */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{t('linked.itemsTitle')}</h3>
        {pr_items.length === 0 ? (
          <p className="text-sm text-slate-400">{t('linked.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1.5 pr-3 font-medium">{tItem('lineNo')}</th>
                  <th className="py-1.5 pr-3 font-medium">{tItem('productName')}</th>
                  <th className="py-1.5 pr-3 font-medium">{tItem('spec')}</th>
                  <th className="py-1.5 pr-3 font-medium">{tItem('unit')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{tItem('unitPrice')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{tItem('quantity')}</th>
                  <th className="py-1.5 font-medium text-right">{tItem('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {linked_purchase_requests.map(pr => {
                  const rows = pr_items.filter(it => it.pr_id === pr.id)
                  if (rows.length === 0) return null
                  return (
                    <Fragment key={pr.id}>
                      <tr className="bg-slate-50 dark:bg-slate-700/40">
                        <td colSpan={7} className="py-1.5 px-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {t('linked.prsTitle')}: {pr.doc_no ?? '—'}
                        </td>
                      </tr>
                      {rows.map((it, i) => (
                        <tr key={`${pr.id}-${i}`} className="border-b border-slate-100 dark:border-slate-700/50">
                          <td className="py-1.5 pr-3 tabular-nums text-slate-500">{it.line_no ?? ''}</td>
                          <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{it.product_name ?? it.product_code ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-slate-500">{it.spec ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-slate-500">{it.unit ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{fmtAmount(it.unit_price)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{it.quantity ?? '—'}</td>
                          <td className="py-1.5 text-right tabular-nums">{fmtAmount(it.amount)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 廠商與報價結果 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{t('linked.quotesTitle')}</h3>
        {quotes.length === 0 ? (
          <p className="text-sm text-slate-400">{t('linked.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1.5 pr-3 font-medium">{t('linked.vendor')}</th>
                  <th className="py-1.5 pr-3 font-medium">{tItem('productName')}</th>
                  <th className="py-1.5 pr-3 font-medium">{tItem('spec')}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{tItem('unitPrice')}</th>
                  <th className="py-1.5 font-medium">{t('linked.quoteDate')}</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{q.vendor_name ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{q.product_name ?? q.product_code ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-slate-500">{q.spec ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmtAmount(q.unit_price)}</td>
                    <td className="py-1.5 text-slate-500 tabular-nums">{q.quote_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 相關採購單 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{t('linked.prsTitle')}</h3>
        {linked_purchase_requests.length === 0 ? (
          <p className="text-sm text-slate-400">{t('linked.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {linked_purchase_requests.map(pr => (
              <li key={pr.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Link href={`/procurement/purchase-requests/${pr.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  {pr.doc_no ?? '—'}
                </Link>
                <RfqStatusBadge status={pr.status} />
                {pr.vendor_name && <span className="text-slate-500">{pr.vendor_name}</span>}
                <span className="ml-auto tabular-nums text-slate-700 dark:text-slate-300">{fmtAmount(pr.total_amount)}</span>
                {pr.fulfillment_status && <span className="text-xs text-slate-400">· {pr.fulfillment_status}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Approval timeline + actions */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6 space-y-5">
        <ApprovalTimeline docType="rfq" steps={steps} docStatus={doc.status} />
        {can_act && current_step_kind && (
          <ApprovalActions docType="rfq" docId={rfqId} stepKind={current_step_kind} onActed={load} />
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('editTitle')}</DialogTitle>
          </DialogHeader>
          <RfqForm
            value={form}
            onChange={(field, value) => setForm(prev => ({ ...prev, [field]: value }))}
            users={users}
            lockedFields={locked_fields}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !canEdit} className="min-h-[44px] cursor-pointer">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void + clone dialog (destructive action — reason required) */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('voidConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('voidConfirmText')}</p>
          <div>
            <label htmlFor="void-reason" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('voidReasonLabel')} <span className="text-red-500">*</span>
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
            <Button variant="outline" onClick={() => setVoidOpen(false)} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleVoidClone} disabled={voiding} className="min-h-[44px] cursor-pointer">
              {voiding ? <Loader2 size={16} className="animate-spin" /> : <CopyX size={16} />}
              {t('voidAndClone')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
