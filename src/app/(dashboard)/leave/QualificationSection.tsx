'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { toast } from 'sonner'
import { Plus, Paperclip, Upload, Loader2, CheckCircle, XCircle, X } from 'lucide-react'

interface QualType { id: string; name: string; requires_qualification: boolean }

interface QualRequest {
  id: string
  leave_type_id: string
  reason: string
  attachments: string[]
  status: string
  hr_note: string | null
  granted_days: number | null
  created_at: string
  leave_type?: { name: string } | null
  applicant?: { display_name: string | null } | null
}

// 特殊假別線上資格申請（回報4）：員工提出（下拉特殊假別＋原因＋多檔附件）＋我的申請清單；
// HR 於同區審核（核給天數＋備註），核准後既有送單阻擋自動解鎖。資料由本元件自行載入。
export function QualificationSection({ leaveTypes, isHR }: { leaveTypes: QualType[]; isHR: boolean }) {
  const t = useTranslations('leave')
  const tc = useTranslations('common')
  const specialTypes = leaveTypes.filter(lt => lt.requires_qualification)

  const [mine, setMine] = useState<QualRequest[]>([])
  const [reviews, setReviews] = useState<QualRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [typeId, setTypeId] = useState('')
  const [reason, setReason] = useState('')
  const [files, setFiles] = useState<{ path: string; name: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/leave/qualifications?view=mine')
      const j = await res.json()
      setMine(j.data ?? [])
      if (isHR) {
        const r = await fetch('/api/leave/qualifications?view=review')
        const rj = await r.json()
        setReviews(rj.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [isHR])

  useEffect(() => { queueMicrotask(load) }, [load])

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const pres = await fetch('/api/storage/presigned', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'leave-files', filename: file.name }),
      })
      if (!pres.ok) throw new Error()
      const { data } = await pres.json()
      const up = await fetch(data.signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!up.ok) throw new Error()
      setFiles(prev => [...prev, { path: data.path, name: file.name }])
    } catch {
      toast.error(t('uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    if (!typeId || !reason.trim()) { toast.error(t('requiredFields')); return }
    setSubmitting(true)
    const res = await fetch('/api/leave/qualifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leave_type_id: typeId, reason: reason.trim(), attachments: files.map(f => f.path) }),
    })
    const { error } = await res.json()
    setSubmitting(false)
    if (error) { toast.error(error); return }
    toast.success(t('qualificationSubmitted'))
    setOpen(false); setTypeId(''); setReason(''); setFiles([])
    load()
  }

  const attachmentLinks = (paths: string[]) =>
    paths.length > 0 ? (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <Paperclip size={12} />
        {paths.map((p, i) => (
          <a key={p} href={`/api/storage/download?bucket=leave-files&path=${encodeURIComponent(p)}`}
             target="_blank" rel="noreferrer" className="underline hover:text-blue-500">#{i + 1}</a>
        ))}
      </span>
    ) : null

  return (
    <div className="space-y-6">
      {/* 員工：提出申請 + 我的申請 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('myQualificationsTitle')}</h3>
          <Button size="sm" onClick={() => setOpen(true)} disabled={specialTypes.length === 0} className="min-h-[36px]">
            <Plus size={15} className="mr-1" />{t('specialLeaveApply')}
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-slate-400 py-6 text-center">{tc('loading')}</p>
        ) : mine.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">{t('noQualificationRequests')}</p>
        ) : (
          <div className="space-y-2">
            {mine.map(r => (
              <div key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{r.leave_type?.name ?? '—'}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{r.reason}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                  {attachmentLinks(r.attachments ?? [])}
                  {r.status === 'approved' && r.granted_days != null && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">{t('grantedDaysInfo', { days: r.granted_days })}</span>
                  )}
                </div>
                {r.hr_note && <p className="text-xs text-slate-400 mt-1">{t('hrNoteLabel')}: {r.hr_note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HR：資格審核 */}
      {isHR && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('qualificationReviewTitle')}</h3>
          {loading ? null : reviews.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">{t('noPendingQualifications')}</p>
          ) : (
            <div className="space-y-2">
              {reviews.map(r => (
                <ReviewCard key={r.id} req={r} attachmentLinks={attachmentLinks} onDone={load} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 申請 dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t('specialLeaveApply')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('leaveType')}</label>
              <Select value={typeId} onValueChange={v => setTypeId(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t('selectSpecialType')} /></SelectTrigger>
                <SelectContent>
                  {specialTypes.map(lt => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('qualificationReasonLabel')}</label>
              <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('qualificationAttachmentsLabel')}</label>
              <div className="mt-1 space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Paperclip size={13} className="text-slate-400 shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <button type="button" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500" aria-label={tc('cancel')}><X size={14} /></button>
                  </div>
                ))}
                <label className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 cursor-pointer">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploading ? t('uploadingAttachment') : t('addAttachment')}
                  <input type="file" className="hidden" disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={submit} disabled={submitting || uploading || !typeId || !reason.trim()}>
              {submitting ? <Loader2 size={15} className="animate-spin mr-1" /> : null}{t('submitApplication')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ReviewCard({ req, attachmentLinks, onDone }: {
  req: QualRequest
  attachmentLinks: (paths: string[]) => ReactNode
  onDone: () => void
}) {
  const t = useTranslations('leave')
  const tc = useTranslations('common')
  const [grantDays, setGrantDays] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const act = async (action: 'approve' | 'reject') => {
    if (action === 'approve' && !(Number(grantDays) > 0)) { toast.error(t('requiredFields')); return }
    setBusy(true)
    const res = await fetch(`/api/leave/qualifications/${req.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        granted_days: action === 'approve' ? Number(grantDays) : undefined,
        hr_note: note || undefined,
      }),
    })
    const { error } = await res.json()
    setBusy(false)
    if (error) { toast.error(error); return }
    toast.success(action === 'approve' ? tc('approved') : tc('rejected'))
    onDone()
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium text-slate-800 dark:text-slate-200">{req.applicant?.display_name ?? '—'}</span>
          <span className="text-slate-400"> · {req.leave_type?.name ?? '—'}</span>
        </div>
        {attachmentLinks(req.attachments ?? [])}
      </div>
      <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{req.reason}</p>
      <div className="flex flex-wrap items-end gap-2 mt-3">
        <div>
          <label className="block text-xs text-slate-400">{t('grantDaysLabel')}</label>
          <Input type="number" min="0" step="0.5" value={grantDays} onChange={e => setGrantDays(e.target.value)} className="w-24 h-9 mt-0.5" />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-slate-400">{t('hrNoteLabel')}</label>
          <Input value={note} onChange={e => setNote(e.target.value)} className="h-9 mt-0.5" />
        </div>
        <Button size="sm" className="min-h-[36px]" disabled={busy} onClick={() => act('approve')}>
          <CheckCircle size={14} className="mr-1" />{t('approveAndGrant')}
        </Button>
        <Button size="sm" variant="outline" className="min-h-[36px] border-red-200 text-red-600 hover:bg-red-50" disabled={busy} onClick={() => act('reject')}>
          <XCircle size={14} className="mr-1" />{tc('reject')}
        </Button>
      </div>
    </div>
  )
}
