'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { DocType } from '@/lib/procurement/doc-types'

// Shared approve / reject (or acknowledge) panel shown when the current
// approval step is actable by the signed-in user. Calls the shared approvals
// API; approve/reject are AAL2-gated (MFA_REQUIRED → redirect to /mfa/verify).

interface Props {
  docType: DocType
  docId: string
  /** approver_kind of the current step — 'anyone' steps use ack (確認, no MFA) */
  stepKind: 'job_role' | 'manager_of' | 'doc_field' | 'anyone'
  /** called after a successful action so the parent can refresh doc + steps */
  onActed: () => void
}

export function ApprovalActions({ docType, docId, stepKind, onActed }: Props) {
  const router = useRouter()
  const t = useTranslations('procurement.approval')
  const tc = useTranslations('common')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState<'approve' | 'reject' | 'ack' | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)

  const act = async (action: 'approve' | 'reject' | 'ack') => {
    setLoading(action)
    const res = await fetch(`/api/procurement/approvals/${docType}/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, comment: comment.trim() || null }),
    })
    const { error, code } = await res.json()
    setLoading(null)
    if (code === 'MFA_REQUIRED') {
      toast.error(t('mfaRequired'))
      router.push('/mfa/verify')
      return
    }
    if (error) { toast.error(error); return }
    setRejectOpen(false)
    setComment('')
    toast.success(action === 'approve' ? t('approveSuccess') : action === 'reject' ? t('rejectSuccess') : t('ackSuccess'))
    onActed()
  }

  const handleReject = () => {
    if (!comment.trim()) { toast.error(t('rejectReasonRequired')); return }
    act('reject')
  }

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-3">
      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">{t('yourTurn')}</p>

      <div>
        <label htmlFor="approval-comment" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          {t('comment')}
        </label>
        <Textarea
          id="approval-comment"
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder={t('commentPlaceholder')}
          rows={2}
          className="text-base bg-white dark:bg-slate-800"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {stepKind === 'anyone' ? (
          <Button onClick={() => act('ack')} disabled={loading !== null} className="min-h-[44px] cursor-pointer">
            {loading === 'ack' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {t('ack')}
          </Button>
        ) : (
          <Button onClick={() => act('approve')} disabled={loading !== null} className="min-h-[44px] cursor-pointer">
            {loading === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {t('approve')}
          </Button>
        )}
        <Button
          variant="destructive"
          onClick={() => setRejectOpen(true)}
          disabled={loading !== null}
          className="min-h-[44px] cursor-pointer"
        >
          <XCircle size={16} />
          {t('reject')}
        </Button>
      </div>

      {/* Reject confirm dialog (destructive action) */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('rejectConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <div>
            <label htmlFor="reject-reason" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('rejectReason')} <span className="text-red-500">*</span>
            </label>
            <Textarea
              id="reject-reason"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t('rejectReasonPlaceholder')}
              rows={3}
              className="text-base"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} className="min-h-[44px] cursor-pointer">
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading !== null} className="min-h-[44px] cursor-pointer">
              {loading === 'reject' ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
              {t('reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
