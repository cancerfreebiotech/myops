'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { toast } from 'sonner'
import { Plus, CheckCircle, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

const OT_TYPE_LABELS: Record<string, string> = {
  weekday: '平日加班', weekend: '假日加班', holiday: '國定假日加班',
  project: '專案加班', on_call: '值班', emergency: '緊急加班',
}

interface Props {
  currentUser: any
  projects: any[]
  rates: any[]
  pendingApprovals: any[]
  isHR: boolean
}

export function OvertimeClient({ currentUser, projects, rates, pendingApprovals, isHR }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'apply' | 'records' | 'approve'>('records')
  const [records, setRecords] = useState<any[]>([])
  const [approvals, setApprovals] = useState(pendingApprovals)
  const [loading, setLoading] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)

  // Form state
  const [otDate, setOtDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [otType, setOtType] = useState('weekday')
  const [projectId, setProjectId] = useState('')
  const [reason, setReason] = useState('')

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/overtime/requests?view=mine')
    const { data } = await res.json()
    setRecords(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const hours = startTime && endTime ? (() => {
    const s = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1])
    const e = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1])
    return Math.max(0, (e - s) / 60).toFixed(1)
  })() : null

  const handleApply = async () => {
    if (!otDate || !startTime || !endTime || !reason.trim()) {
      toast.error('請填寫所有必填欄位')
      return
    }
    setLoading(true)
    const res = await fetch('/api/overtime/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ot_date: otDate, start_time: startTime, end_time: endTime, reason, ot_type: otType, project_id: projectId || null }),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success('加班申請已送出')
    setApplyOpen(false)
    setOtDate(''); setStartTime(''); setEndTime(''); setReason(''); setOtType('weekday'); setProjectId('')
    fetchRecords()
  }

  const handleAction = async (id: string, action: 'approve' | 'reject', rejectReason?: string) => {
    const res = await fetch(`/api/overtime/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reject_reason: rejectReason }),
    })
    const { error } = await res.json()
    if (error) { toast.error(error); return }
    toast.success(action === 'approve' ? '已核准' : '已退回')
    setApprovals(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {[
          { key: 'records', label: '我的申請' },
          { key: 'apply', label: '新增加班' },
          ...(pendingApprovals.length > 0 || isHR ? [{ key: 'approve', label: '待審核', badge: approvals.length }] : []),
        ].map((t: any) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs bg-red-500 text-white rounded-full">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'records' && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">類型</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">時段</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">時數</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">載入中...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">無申請紀錄</td></tr>
              ) : records.map((r: any) => (
                <tr key={r.id} className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.ot_date}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{OT_TYPE_LABELS[r.ot_type] ?? r.ot_type}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.start_time} ~ {r.end_time}</td>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">{r.total_hours} h</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'apply' && (
        <div className="max-w-lg">
          <Button onClick={() => setApplyOpen(true)} className="min-h-[44px]">
            <Plus size={16} className="mr-1.5" /> 新增加班申請
          </Button>
        </div>
      )}

      {tab === 'approve' && (
        <div className="space-y-3">
          {approvals.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle size={32} className="text-green-400 mx-auto mb-2" />
              <p className="text-slate-500">沒有待審核的加班申請</p>
            </div>
          ) : approvals.map((r: any) => (
            <OTApprovalCard key={r.id} request={r} onAction={handleAction} />
          ))}
        </div>
      )}

      {/* Apply dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>新增加班申請</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">加班日期</label>
                <Input type="date" value={otDate} onChange={e => setOtDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">加班類型</label>
                <Select value={otType} onValueChange={v => setOtType(v ?? 'weekday')}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(OT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">開始時間</label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">結束時間</label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1" />
              </div>
            </div>
            {hours && <p className="text-sm text-slate-500">共 {hours} 小時</p>}
            {projects.length > 0 && (
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">關聯專案（選填）</label>
                <Select value={projectId} onValueChange={v => setProjectId(v ?? '')}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="不關聯專案" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">不關聯專案</SelectItem>
                    {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">加班原因</label>
              <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} className="mt-1" placeholder="請說明加班原因..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>取消</Button>
            <Button onClick={handleApply} disabled={loading}>{loading ? '送出中...' : '送出申請'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OTApprovalCard({ request, onAction }: { request: any, onAction: (id: string, action: 'approve' | 'reject', reason?: string) => void }) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-200">{request.user?.display_name}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {request.ot_date} · {request.start_time}~{request.end_time} ({request.total_hours}h)
            {request.project && ` · ${request.project.name}`}
          </p>
          {request.reason && <p className="text-sm text-slate-400 mt-1">{request.reason}</p>}
        </div>
        <StatusBadge status={request.status} />
      </div>
      {request.status === 'pending' && (
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" className="min-h-[36px]" onClick={() => onAction(request.id, 'approve')}>
            <CheckCircle size={13} className="mr-1" /> 核准
          </Button>
          <Button size="sm" variant="outline" className="min-h-[36px] border-red-200 text-red-600 hover:bg-red-50" onClick={() => setRejectOpen(true)}>
            <XCircle size={13} className="mr-1" /> 退回
          </Button>
        </div>
      )}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>退回加班申請</DialogTitle></DialogHeader>
          <Textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="退回原因..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={() => { onAction(request.id, 'reject', rejectReason); setRejectOpen(false) }}>確認退回</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
