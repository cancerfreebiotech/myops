'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, Paperclip, Download, Check, X, Banknote, Plane } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { taipeiToday } from '@/lib/taipei-date'

interface ExpenseClaim {
  id: string
  user_id: string
  expense_date: string
  category: string
  amount: number
  currency: string
  description: string
  receipt_paths: string[]
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled'
  review_note: string | null
  user: { id: string; display_name: string | null; email: string } | null
  reviewer: { id: string; display_name: string | null } | null
  trip: { id: string; destination: string; start_date: string; end_date: string } | null
}

interface Props {
  isApprover: boolean
  prefillTrip?: { id: string; destination: string; start_date: string; end_date: string } | null
}

type Tab = 'mine' | 'new' | 'approve'

const CATEGORIES = ['transport', 'travel', 'meal', 'supplies', 'other'] as const
const CATEGORY_KEYS = {
  transport: 'catTransport', travel: 'catTravel', meal: 'catMeal',
  supplies: 'catSupplies', other: 'catOther',
} as const
const STATUS_KEYS = {
  pending: 'statusPending', approved: 'statusApproved', rejected: 'statusRejected',
  paid: 'statusPaid', cancelled: 'statusCancelled',
} as const

const STATUS_COLORS: Record<ExpenseClaim['status'], string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
  approved: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  rejected: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
  paid: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
}

export function ExpensesClient({ isApprover, prefillTrip }: Props) {
  const t = useTranslations('expense')
  const [tab, setTab] = useState<Tab>(prefillTrip ? 'new' : 'mine')
  const [claims, setClaims] = useState<ExpenseClaim[]>([])
  const [loading, setLoading] = useState(true)

  // New claim form
  const [expenseDate, setExpenseDate] = useState(() => taipeiToday())
  const [category, setCategory] = useState<string>(prefillTrip ? 'travel' : 'transport')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState(
    prefillTrip ? `${prefillTrip.destination} ${prefillTrip.start_date}~${prefillTrip.end_date}` : ''
  )
  const [receipts, setReceipts] = useState<{ path: string; name: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const view = tab === 'approve' ? 'all' : 'mine'

  const loadClaims = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/expenses?view=${view}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setClaims(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [view, t])

  useEffect(() => {
    const load = async () => { await loadClaims() }
    load()
  }, [loadClaims])

  const uploadReceipt = async (file: File) => {
    setUploading(true)
    try {
      const presignedRes = await fetch('/api/storage/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'expense-receipts', filename: file.name }),
      })
      if (!presignedRes.ok) throw new Error()
      const { data: presigned } = await presignedRes.json()
      const uploadRes = await fetch(presigned.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) throw new Error()
      setReceipts(prev => [...prev, { path: presigned.path, name: file.name }])
    } catch {
      toast.error(t('uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const submitClaim = async () => {
    const numAmount = Number(amount)
    if (!expenseDate || !description.trim() || !Number.isFinite(numAmount) || numAmount <= 0) {
      toast.error(t('requiredFields'))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_date: expenseDate,
          category,
          amount: numAmount,
          description: description.trim(),
          receipt_paths: receipts.map(r => r.path),
          ...(prefillTrip ? { trip_id: prefillTrip.id } : {}),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('submitted'))
      setAmount('')
      setDescription('')
      setReceipts([])
      setExpenseDate(taipeiToday())
      setTab('mine')
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const patchClaim = async (id: string, body: Record<string, unknown>, successMsg: string) => {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      toast.error(json?.code === 'MFA_REQUIRED' ? t('mfaRequired') : t('saveFailed'))
      return
    }
    toast.success(successMsg)
    await loadClaims()
  }

  const cancelClaim = async (id: string) => {
    if (!confirm(t('cancelConfirm'))) return
    await patchClaim(id, { action: 'cancel' }, t('cancelled'))
  }

  const approveClaim = (id: string) => patchClaim(id, { action: 'approve' }, t('approved'))
  const rejectClaim = (id: string) => {
    const note = prompt(t('reviewNote')) ?? ''
    patchClaim(id, { action: 'reject', review_note: note }, t('rejected'))
  }
  const payClaim = (id: string) => patchClaim(id, { action: 'pay' }, t('paidDone'))

  const fmtAmount = (c: ExpenseClaim) =>
    `${c.currency === 'TWD' ? 'NT$' : c.currency + ' '}${Number(c.amount).toLocaleString()}`

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mine', label: t('tabMine') },
    { key: 'new', label: t('tabNew') },
    ...(isApprover ? [{ key: 'approve' as Tab, label: t('tabApprove') }] : []),
  ]

  const visibleClaims = tab === 'approve'
    ? claims.filter(c => c.status === 'pending' || c.status === 'approved')
    : claims

  const renderClaim = (c: ExpenseClaim) => (
    <Card key={c.id}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {fmtAmount(c)}
              </span>
              <Badge variant="outline" className="text-xs">{t(CATEGORY_KEYS[c.category as keyof typeof CATEGORY_KEYS] ?? 'catOther')}</Badge>
              <Badge className={`text-xs border ${STATUS_COLORS[c.status]}`}>{t(STATUS_KEYS[c.status])}</Badge>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 break-words">{c.description}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-slate-400">{c.expense_date}</span>
              {c.trip && (
                <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                  <Plane size={12} />{c.trip.destination}
                </span>
              )}
              {tab === 'approve' && c.user && (
                <span className="text-xs text-slate-400">{t('applicant')}: {c.user.display_name ?? c.user.email}</span>
              )}
              {c.reviewer && (
                <span className="text-xs text-slate-400">{t('reviewer')}: {c.reviewer.display_name}</span>
              )}
              {c.review_note && (
                <span className="text-xs text-slate-400">「{c.review_note}」</span>
              )}
              {c.receipt_paths.length > 0 && (
                <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                  <Paperclip size={12} />
                  {c.receipt_paths.map((p, i) => (
                    <a
                      key={p}
                      href={`/api/storage/download?bucket=expense-receipts&path=${encodeURIComponent(p)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-blue-500"
                    >
                      #{i + 1}
                    </a>
                  ))}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {tab === 'mine' && c.status === 'pending' && (
              <Button variant="ghost" size="icon" onClick={() => cancelClaim(c.id)} className="text-slate-400 hover:text-red-500 h-8 w-8">
                <Trash2 size={14} />
              </Button>
            )}
            {tab === 'approve' && c.status === 'pending' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => approveClaim(c.id)} className="text-xs text-green-600 hover:text-green-700">
                  <Check size={14} className="mr-1" />{t('approve')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => rejectClaim(c.id)} className="text-xs text-red-500 hover:text-red-600">
                  <X size={14} className="mr-1" />{t('reject')}
                </Button>
              </>
            )}
            {tab === 'approve' && c.status === 'approved' && (
              <Button variant="ghost" size="sm" onClick={() => payClaim(c.id)} className="text-xs text-blue-600 hover:text-blue-700">
                <Banknote size={14} className="mr-1" />{t('markPaid')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4 pb-8">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === item.key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
        {isApprover && (
          <a
            href="/api/export/expenses"
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <Download size={13} />{t('exportXlsx')}
          </a>
        )}
      </div>

      {/* New claim form */}
      {tab === 'new' && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            {prefillTrip && (
              <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                <Plane size={12} />{t('tripLabel')}: {prefillTrip.destination}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('expenseDate')}</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={e => setExpenseDate(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('category')}</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{t(CATEGORY_KEYS[c])}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('amount')}（TWD）</label>
                <Input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-32 text-right tabular-nums"
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('descriptionLabel')}</label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('receipts')}</label>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <Paperclip size={14} />
                  {uploading ? t('submitting') : t('uploadReceipt')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                    className="hidden"
                    disabled={uploading}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) uploadReceipt(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                {receipts.map((r, i) => (
                  <span key={r.path} className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1">
                    #{i + 1} {r.name}
                    <button onClick={() => setReceipts(prev => prev.filter(x => x.path !== r.path))} className="text-slate-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <Button onClick={submitClaim} disabled={submitting || uploading}>
              <Plus size={14} className="mr-1" />{submitting ? t('submitting') : t('submit')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Claims list */}
      {tab !== 'new' && (
        <div className="space-y-2">
          {loading && <p className="text-sm text-slate-400">…</p>}
          {!loading && visibleClaims.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              {tab === 'approve' ? t('noPending') : t('noClaims')}
            </p>
          )}
          {visibleClaims.map(renderClaim)}
        </div>
      )}
    </div>
  )
}
