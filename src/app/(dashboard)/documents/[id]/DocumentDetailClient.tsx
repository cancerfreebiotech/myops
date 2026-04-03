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

const DOC_TYPE_LABELS: Record<string, string> = {
  ANN: '公告', REG: '規章', NDA: '保密協議', MOU: '合作備忘錄',
  CONTRACT: '合約', AMEND: '合約修正', INTERNAL: '內部文件',
}
const FOLDER_LABELS: Record<string, string> = {
  shared: '全公司共用', contracts: '外部合約', internal: '內部文件', archived: '封存',
}
const ACTION_LABELS: Record<string, string> = {
  upload: '上傳', approve: '核准', reject: '退回', archive: '封存',
  publish: '發佈', translate: 'AI 翻譯', confirm: '確認閱讀',
}

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
    if (ok) { toast.success('已核准'); router.refresh() }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast.error('請填寫退回原因'); return }
    const ok = await patch({ status: 'rejected', reject_reason: rejectReason, _action: 'reject' })
    if (ok) { setRejectOpen(false); toast.success('已退回'); router.refresh() }
  }

  const handleArchive = async () => {
    const ok = await patch({ status: 'archived', folder: 'archived', _action: 'archive' })
    if (ok) { toast.success('已封存'); router.refresh() }
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
    toast.success('公告已發佈')
    router.refresh()
  }

  const handleConfirmRead = async () => {
    setConfirming(true)
    const res = await fetch(`/api/documents/${doc.id}/confirm`, { method: 'POST' })
    const { error, code } = await res.json()
    setConfirming(false)
    if (code === 'MFA_REQUIRED') { toast.error('請先完成雙重驗證'); router.push('/mfa/verify'); return }
    if (error) { toast.error(error); return }
    toast.success('已確認閱讀')
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
    toast.success('AI 翻譯完成')
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
                <Badge variant="outline" className="text-xs">{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</Badge>
                <span className="text-xs text-slate-400">{FOLDER_LABELS[doc.folder] ?? doc.folder}</span>
              </div>
            </div>
            <StatusBadge status={doc.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400">上傳者</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.uploaded_by_user?.display_name ?? '—'}</p>
            </div>
            <div>
              <span className="text-slate-400">上傳時間</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5">{format(new Date(doc.created_at), 'yyyy/MM/dd HH:mm')}</p>
            </div>
            {doc.company && (
              <div>
                <span className="text-slate-400">關聯公司</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.company.name}</p>
              </div>
            )}
            {doc.department && (
              <div>
                <span className="text-slate-400">所屬部門</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.department.name}</p>
              </div>
            )}
            {doc.expires_at && (
              <div>
                <span className="text-slate-400">到期日</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">{doc.expires_at}</p>
              </div>
            )}
            {doc.approved_by_user && (
              <div>
                <span className="text-slate-400">核准者</span>
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
                    <Download size={14} className="mr-1" /> 下載
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
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">公告內容</h3>
              {canPublish && !doc.ai_translated && (
                <Button variant="outline" size="sm" onClick={handleTranslate} disabled={translating} className="min-h-[36px]">
                  <Globe size={14} className="mr-1" />
                  {translating ? 'AI 翻譯中...' : 'AI 翻譯'}
                </Button>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-400 mb-1">中文</p>
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
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-3">收件人確認狀況</h3>
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
                      <span className="text-slate-400 text-xs">未確認</span>
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
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">審核操作</h3>
            <Button className="w-full min-h-[44px]" onClick={handleApprove} disabled={loading}>
              <CheckCircle size={15} className="mr-1.5" /> 核准
            </Button>
            <Button variant="outline" className="w-full min-h-[44px] border-red-200 text-red-600 hover:bg-red-50" onClick={() => setRejectOpen(true)} disabled={loading}>
              <XCircle size={15} className="mr-1.5" /> 退回
            </Button>
          </div>
        )}
        {doc.status === 'pending' && canPublish && isAnnouncement && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">發佈操作</h3>
            <Button className="w-full min-h-[44px]" onClick={() => setPublishOpen(true)} disabled={loading}>
              <Send size={15} className="mr-1.5" /> 發佈公告
            </Button>
            <Button variant="outline" className="w-full min-h-[44px] border-red-200 text-red-600 hover:bg-red-50" onClick={() => setRejectOpen(true)} disabled={loading}>
              <XCircle size={15} className="mr-1.5" /> 退回
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
              <p className="text-sm text-green-700 dark:text-green-400">已確認閱讀</p>
              <p className="text-xs text-slate-400">{format(new Date(myRecord.confirmed_at), 'MM/dd HH:mm')}</p>
            </div>
          )
          return (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <Button className="w-full min-h-[44px]" onClick={handleConfirmRead} disabled={confirming}>
                <CheckCircle size={15} className="mr-1.5" />
                {confirming ? '確認中...' : '確認已閱讀（需 2FA）'}
              </Button>
            </div>
          )
        })()}
        {doc.status === 'approved' && canApprove && !['ANN', 'REG'].includes(doc.doc_type) && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <Button variant="outline" className="w-full min-h-[44px] text-slate-600" onClick={handleArchive} disabled={loading}>
              <Archive size={15} className="mr-1.5" /> 封存文件
            </Button>
          </div>
        )}

        {/* Audit log */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
            <Clock size={14} /> 操作記錄
          </h3>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400">無記錄</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{ACTION_LABELS[log.action] ?? log.action}</span>
                    <span className="text-slate-400">{format(new Date(log.created_at), 'MM/dd HH:mm')}</span>
                  </div>
                  <p className="text-slate-400 mt-0.5">{log.user?.display_name}</p>
                  {log.detail?.reason && <p className="text-red-500 mt-0.5">原因：{log.detail.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>退回文件</DialogTitle></DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">退回原因</label>
            <Textarea
              className="mt-1"
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="請說明退回原因..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading}>確認退回</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish dialog */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>發佈公告</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">選擇收件人</label>
              <p className="text-xs text-slate-400 mb-2">不選擇則發佈給所有人</p>
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
                <p className="text-xs text-blue-600 mt-1">已選 {selectedUsers.length} 人</p>
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
                <span className="text-slate-700 dark:text-slate-300">需要確認閱讀</span>
              </label>
            </div>
            {requireConfirm && (
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">提醒間隔（天）</label>
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
            <Button variant="outline" onClick={() => setPublishOpen(false)}>取消</Button>
            <Button onClick={handlePublish} disabled={loading}>
              <Send size={14} className="mr-1.5" />
              {loading ? '發佈中...' : '確認發佈'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
