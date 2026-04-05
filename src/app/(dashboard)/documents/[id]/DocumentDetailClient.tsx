'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/StatusBadge'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Download, CheckCircle, XCircle, Archive, Globe, FileText, Clock, Send } from 'lucide-react'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useTranslations } from 'next-intl'

interface Props {
  doc: any
  auditLogs: any[]
  recipients: any[]
  currentUser: any
  canApprove: boolean
  canPublish: boolean
  downloadUrl: string | null
  allUsers?: any[]
}

export function DocumentDetailClient({ doc, auditLogs, recipients, currentUser, canApprove, canPublish, downloadUrl, allUsers = [] }: Props) {
  const router = useRouter()
  const t = useTranslations('documents')
  const td = useTranslations('documents.detail')
  const ta = useTranslations('documents.actions')
  const tc = useTranslations('common')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [requireConfirm, setRequireConfirm] = useState(true)
  const [reminderDays, setReminderDays] = useState('3')
  const [loading, setLoading] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const isAnnouncement = ['ANN', 'REG'].includes(doc.doc_type)
  const isContract = ['NDA', 'MOU', 'CONTRACT', 'AMEND'].includes(doc.doc_type)

  const patch = async (body: object) => {
    setLoading(true)
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return false }
    return true
  }

  const handleApprove = async () => {
    const ok = await patch({ status: 'approved', approved_at: new Date().toISOString(), _action: 'approve' })
    if (ok) { toast.success(td('approved')); router.refresh() }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast.error(td('rejectReasonRequired')); return }
    const ok = await patch({ status: 'rejected', reject_reason: rejectReason, _action: 'reject' })
    if (ok) { setRejectOpen(false); toast.success(td('rejected')); router.refresh() }
  }

  const handleArchive = async () => {
    const ok = await patch({ status: 'archived', folder: 'archived', _action: 'archive' })
    if (ok) { toast.success(td('archived')); router.refresh() }
  }

  const handlePublish = async () => {
    setLoading(true)
    const res = await fetch(`/api/documents/${doc.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_user_ids: selectedUsers,
        requires_confirmation: requireConfirm,
        reminder_days: parseInt(reminderDays),
      }),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    setPublishOpen(false)
    toast.success(td('announcementPublished'))
    router.refresh()
  }

  const handleConfirmRead = async () => {
    setConfirming(true)
    const res = await fetch(`/api/documents/${doc.id}/confirm`, { method: 'POST' })
    const { error, code } = await res.json()
    setConfirming(false)
    if (code === 'MFA_REQUIRED') { toast.error(td('mfaRequired')); router.push('/mfa/verify'); return }
    if (error) { toast.error(error); return }
    toast.success(td('confirmed'))
    router.refresh()
  }

  const toggleUser = (uid: string) =>
    setSelectedUsers(prev => prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid])

  const handleTranslate = async () => {
    setTranslating(true)
    const res = await fetch(`/api/documents/${doc.id}/translate`, { method: 'POST' })
    const { error } = await res.json()
    setTranslating(false)
    if (error) { toast.error(error); return }
    toast.success(td('aiTranslateComplete'))
    router.refresh()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main content */}
      <div className="lg:col-span-2 space-y-6">
        {/* Meta card */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{doc.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">{t(`docTypes.${doc.doc_type}` as any) ?? doc.doc_type}</Badge>
                <span className="text-xs text-slate-400">{t(`folders.${doc.folder}` as any) ?? doc.folder}</span>
              </div>
            </div>
            <StatusBadge status={doc.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400">{td('uploader')}</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.uploaded_by_user?.display_name ?? '—'}</p>
            </div>
            <div>
              <span className="text-slate-400">{td('uploadTime')}</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5">{format(new Date(doc.created_at), 'yyyy/MM/dd HH:mm')}</p>
            </div>
            {doc.company && (
              <div>
                <span className="text-slate-400">{td('relatedCompany')}</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.company.name}</p>
              </div>
            )}
            {doc.department && (
              <div>
                <span className="text-slate-400">{td('department')}</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.department.name}</p>
              </div>
            )}
            {doc.expires_at && (
              <div>
                <span className="text-slate-400">{td('expiresAt')}</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.expires_at}</p>
              </div>
            )}
            {doc.approved_by_user && (
              <div>
                <span className="text-slate-400">{td('approver')}</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.approved_by_user.display_name}</p>
              </div>
            )}
          </div>

          {doc.file_name && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
              <FileText size={18} className="text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{doc.file_name}</p>
                {doc.file_size && <p className="text-xs text-slate-400">{(doc.file_size / 1024 / 1024).toFixed(2)} MB</p>}
              </div>
              {downloadUrl && (
                <a href={downloadUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="min-h-[36px]">
                    <Download size={14} className="mr-1" /> {td('download')}
                  </Button>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Announcement content */}
        {isAnnouncement && doc.content_zh && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">{td('announcementContent')}</h3>
              {canPublish && !doc.ai_translated && (
                <Button variant="outline" size="sm" onClick={handleTranslate} disabled={translating} className="min-h-[36px]">
                  <Globe size={14} className="mr-1" />
                  {translating ? td('aiTranslating') : td('aiTranslate')}
                </Button>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-400 mb-1">{td('chinese')}</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{doc.content_zh}</p>
              </div>
              {doc.content_en && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">English {doc.ai_translated && <span className="text-blue-500">(AI)</span>}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{doc.content_en}</p>
                </div>
              )}
              {doc.content_ja && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">日本語 {doc.ai_translated && <span className="text-blue-500">(AI)</span>}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{doc.content_ja}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recipients (for announcements) */}
        {isAnnouncement && recipients.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">{td('recipientStatus')}</h3>
            <div className="space-y-2">
              {recipients.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{r.user?.display_name ?? r.user_id}</span>
                  <div className="flex items-center gap-2">
                    {r.confirmed_at ? (
                      <>
                        <CheckCircle size={14} className="text-green-500" />
                        <span className="text-green-600 dark:text-green-400 text-xs">{format(new Date(r.confirmed_at), 'MM/dd HH:mm')}</span>
                      </>
                    ) : (
                      <span className="text-slate-400 text-xs">{td('unconfirmed')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar: Actions + Audit log */}
      <div className="space-y-4">
        {/* Actions */}
        {doc.status === 'pending' && canApprove && !isAnnouncement && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{td('reviewActions')}</h3>
            <Button className="w-full min-h-[44px]" onClick={handleApprove} disabled={loading}>
              <CheckCircle size={15} className="mr-1.5" /> {td('approve')}
            </Button>
            <Button variant="outline" className="w-full min-h-[44px] border-red-200 text-red-600 hover:bg-red-50" onClick={() => setRejectOpen(true)} disabled={loading}>
              <XCircle size={15} className="mr-1.5" /> {td('reject')}
            </Button>
          </div>
        )}
        {doc.status === 'pending' && canPublish && isAnnouncement && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{td('publishActions')}</h3>
            <Button className="w-full min-h-[44px]" onClick={() => setPublishOpen(true)} disabled={loading}>
              <Send size={15} className="mr-1.5" /> {td('publishAnnouncement')}
            </Button>
            <Button variant="outline" className="w-full min-h-[44px] border-red-200 text-red-600 hover:bg-red-50" onClick={() => setRejectOpen(true)} disabled={loading}>
              <XCircle size={15} className="mr-1.5" /> {td('reject')}
            </Button>
          </div>
        )}
        {/* Confirm read button for recipients */}
        {isAnnouncement && doc.status === 'approved' && (() => {
          const myRecord = recipients.find((r: any) => r.user_id === currentUser?.id)
          if (!myRecord) return null
          if (myRecord.confirmed_at) return (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 text-center">
              <CheckCircle size={20} className="text-green-500 mx-auto mb-1" />
              <p className="text-sm text-green-700 dark:text-green-400">{td('confirmed')}</p>
              <p className="text-xs text-slate-400">{format(new Date(myRecord.confirmed_at), 'MM/dd HH:mm')}</p>
            </div>
          )
          return (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <Button className="w-full min-h-[44px]" onClick={handleConfirmRead} disabled={confirming}>
                <CheckCircle size={15} className="mr-1.5" />
                {confirming ? td('confirming') : td('confirmReadWith2fa')}
              </Button>
            </div>
          )
        })()}
        {doc.status === 'approved' && canApprove && !['ANN', 'REG'].includes(doc.doc_type) && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <Button variant="outline" className="w-full min-h-[44px] text-slate-600" onClick={handleArchive} disabled={loading}>
              <Archive size={15} className="mr-1.5" /> {td('archiveDocument')}
            </Button>
          </div>
        )}

        {/* Audit log */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
            <Clock size={14} /> {td('auditLog')}
          </h3>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400">{td('noRecords')}</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{ta(log.action as any) ?? log.action}</span>
                    <span className="text-slate-400">{format(new Date(log.created_at), 'MM/dd HH:mm')}</span>
                  </div>
                  <p className="text-slate-400 mt-0.5">{log.user?.display_name}</p>
                  {log.detail?.reason && <p className="text-red-500 mt-0.5">{td('reason', { reason: log.detail.reason })}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{td('rejectDocument')}</DialogTitle></DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{td('rejectReason')}</label>
            <Textarea
              className="mt-1"
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder={td('rejectReasonPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading}>{td('confirmReject')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish dialog */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{td('publishDialog')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{td('selectRecipients')}</label>
              <p className="text-xs text-slate-400 mb-2">{td('selectRecipientsHint')}</p>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-md p-2">
                {allUsers.map((u: any) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer py-1 px-1 hover:bg-slate-50 dark:hover:bg-slate-700 rounded">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="accent-blue-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">{u.display_name}</span>
                    {u.department?.name && <span className="text-xs text-slate-400">{u.department.name}</span>}
                  </label>
                ))}
              </div>
              {selectedUsers.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">{td('selectedCount', { count: selectedUsers.length })}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireConfirm}
                  onChange={e => setRequireConfirm(e.target.checked)}
                  className="accent-blue-600"
                />
                <span className="text-slate-700 dark:text-slate-300">{td('requireConfirmRead')}</span>
              </label>
            </div>
            {requireConfirm && (
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{td('reminderDays')}</label>
                <Input
                  type="number"
                  min="1"
                  max="30"
                  value={reminderDays}
                  onChange={e => setReminderDays(e.target.value)}
                  className="mt-1 w-24"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handlePublish} disabled={loading}>
              <Send size={14} className="mr-1.5" />
              {loading ? td('publishing') : td('confirmPublish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
