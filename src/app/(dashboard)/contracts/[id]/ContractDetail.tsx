'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/StatusBadge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Download, CheckCircle, XCircle, FileText, Clock, AlertTriangle, Building2, User, Calendar, HardDrive,
} from 'lucide-react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'

const DOC_TYPE_LABELS: Record<string, string> = {
  NDA: '保密協議',
  MOU: '合作備忘錄',
  CONTRACT: '合約',
  AMEND: '合約修正',
}

const ACTION_LABELS: Record<string, string> = {
  upload: '上傳',
  approve: '核准',
  reject: '退回',
  archive: '封存',
  download: '下載',
}

interface Props {
  doc: any
  relatedDocs: any[]
  auditLogs: any[]
  downloadUrl: string | null
  currentUser: any
  canApprove: boolean
}

function ExpiryDisplay({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return <span className="text-slate-400">—</span>

  const days = differenceInCalendarDays(parseISO(expiresAt), new Date())

  if (days < 0) {
    return (
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={14} className="text-red-500 shrink-0" aria-hidden />
        <span className="text-red-600 dark:text-red-400 font-medium">{expiresAt}（已到期）</span>
      </div>
    )
  }
  if (days <= 30) {
    return (
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={14} className="text-red-500 shrink-0" aria-hidden />
        <span className="text-red-600 dark:text-red-400 font-medium">{expiresAt}（剩 {days} 天）</span>
      </div>
    )
  }
  if (days <= 90) {
    return (
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={14} className="text-orange-400 shrink-0" aria-hidden />
        <span className="text-orange-600 dark:text-orange-400 font-medium">{expiresAt}（剩 {days} 天）</span>
      </div>
    )
  }
  return <span className="text-slate-700 dark:text-slate-300">{expiresAt}</span>
}

export function ContractDetail({ doc, relatedDocs, auditLogs, downloadUrl, currentUser, canApprove }: Props) {
  const router = useRouter()
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [loading, setLoading] = useState(false)

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
    const ok = await patch({
      status: 'approved',
      approved_at: new Date().toISOString(),
      _action: 'approve',
    })
    if (ok) {
      setApproveOpen(false)
      toast.success('合約已核准')
      router.refresh()
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast.error('請填寫退回原因'); return }
    const ok = await patch({
      status: 'rejected',
      reject_reason: rejectReason,
      _action: 'reject',
    })
    if (ok) {
      setRejectOpen(false)
      setRejectReason('')
      toast.success('合約已退回')
      router.refresh()
    }
  }

  const fileSizeMb = doc.file_size ? (doc.file_size / 1024 / 1024).toFixed(2) : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Main column ── */}
      <div className="lg:col-span-2 space-y-6">

        {/* Header card */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 font-[Lexend]">
                {doc.title}
              </h2>
              <div className="flex items-center flex-wrap gap-2">
                {doc.company && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                    <Building2 size={11} aria-hidden />
                    {doc.company.name}
                  </span>
                )}
                <Badge variant="outline" className="text-xs">
                  {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                </Badge>
              </div>
            </div>
            <StatusBadge status={doc.status} />
          </div>

          {/* Expiry row */}
          {doc.expires_at && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar size={14} className="text-slate-400 shrink-0" aria-hidden />
              <span className="text-slate-400 shrink-0">到期日</span>
              <ExpiryDisplay expiresAt={doc.expires_at} />
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm pt-1 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-start gap-2">
              <User size={14} className="text-slate-400 shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="text-slate-400 text-xs">負責人</p>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                  {doc.uploaded_by_user?.display_name ?? '—'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar size={14} className="text-slate-400 shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="text-slate-400 text-xs">上傳日期</p>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                  {format(new Date(doc.created_at), 'yyyy-MM-dd')}
                </p>
              </div>
            </div>
            {fileSizeMb && (
              <div className="flex items-start gap-2">
                <HardDrive size={14} className="text-slate-400 shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="text-slate-400 text-xs">檔案大小</p>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5">{fileSizeMb} MB</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <FileText size={14} className="text-slate-400 shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="text-slate-400 text-xs">文件類型</p>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                  {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                </p>
              </div>
            </div>
          </div>

          {/* Download button */}
          {downloadUrl && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <a href={downloadUrl} target="_blank" rel="noreferrer">
                <Button
                  className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-150"
                  aria-label={`下載 ${doc.file_name ?? '合約文件'}`}
                >
                  <Download size={16} className="mr-2" aria-hidden />
                  下載合約文件
                </Button>
              </a>
              {doc.file_name && (
                <p className="text-xs text-slate-400 mt-1.5 truncate">{doc.file_name}</p>
              )}
            </div>
          )}
        </div>

        {/* Related documents */}
        {relatedDocs.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              同公司其他文件
            </h3>
            <div className="space-y-2">
              {relatedDocs.map((rd) => (
                <a
                  key={rd.id}
                  href={`/contracts/${rd.id}`}
                  className="flex items-center justify-between p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-150 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-slate-400 shrink-0" aria-hidden />
                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate group-hover:text-blue-600 transition-colors duration-150">
                      {rd.title}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {DOC_TYPE_LABELS[rd.doc_type] ?? rd.doc_type}
                    </Badge>
                  </div>
                  <StatusBadge status={rd.status} />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Sidebar ── */}
      <div className="space-y-4">
        {/* Approve / Reject actions */}
        {doc.status === 'pending' && canApprove && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">審核操作</h3>
            <Button
              className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-150"
              onClick={() => setApproveOpen(true)}
              disabled={loading}
            >
              <CheckCircle size={15} className="mr-1.5" aria-hidden />
              核准合約
            </Button>
            <Button
              variant="outline"
              className="w-full min-h-[44px] border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150"
              onClick={() => setRejectOpen(true)}
              disabled={loading}
            >
              <XCircle size={15} className="mr-1.5" aria-hidden />
              退回合約
            </Button>
          </div>
        )}

        {/* Audit log */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
            <Clock size={14} aria-hidden />
            操作記錄
          </h3>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400">尚無記錄</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left text-slate-400 font-medium pb-2">動作</th>
                    <th className="text-left text-slate-400 font-medium pb-2">操作者</th>
                    <th className="text-left text-slate-400 font-medium pb-2">時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {auditLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="py-2 pr-2">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                        {log.detail?.reason && (
                          <p className="text-red-500 mt-0.5">原因：{log.detail.reason}</p>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-slate-500">
                        {log.user?.display_name ?? '—'}
                      </td>
                      <td className="py-2 text-slate-400 whitespace-nowrap">
                        {format(new Date(log.created_at), 'MM-dd HH:mm')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Approve confirm dialog ── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認核准此合約？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-400 py-2">
            核准後狀態將更新為「已核准」，此操作將記錄於稽核日誌。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] transition-colors duration-150"
              onClick={handleApprove}
              disabled={loading}
            >
              {loading ? '核准中...' : '確認核准'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject dialog ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認退回此合約？</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label htmlFor="reject-reason" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              退回原因 <span className="text-red-500" aria-hidden>*</span>
            </label>
            <Textarea
              id="reject-reason"
              className="mt-1"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="請說明退回原因..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button
              variant="destructive"
              className="min-h-[44px] transition-colors duration-150"
              onClick={handleReject}
              disabled={loading}
            >
              {loading ? '退回中...' : '確認退回'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
