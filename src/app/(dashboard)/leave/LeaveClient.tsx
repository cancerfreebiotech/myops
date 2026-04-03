'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/StatusBadge'
import { toast } from 'sonner'
import { Plus, CheckCircle, XCircle } from 'lucide-react'
import { format, differenceInCalendarDays, addDays, parseISO } from 'date-fns'

const PAY_LABELS: Record<string, string> = { full: '全薪', half: '半薪', none: '無薪' }

interface Props {
  currentUser: any
  leaveTypes: any[]
  balances: any[]
  colleagues: any[]
  pendingApprovals: any[]
  isHR: boolean
}

export function LeaveClient({ currentUser, leaveTypes, balances, colleagues, pendingApprovals, isHR }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'apply' | 'records' | 'approve' | 'balance'>('balance')
  const [records, setRecords] = useState<any[]>([])
  const [approvals, setApprovals] = useState(pendingApprovals)
  const [loading, setLoading] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)

  // Apply form state
  const [selectedType, setSelectedType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [halfDay, setHalfDay] = useState<'' | 'morning' | 'afternoon'>('')
  const [reason, setReason] = useState('')
  const [deputyId, setDeputyId] = useState('')

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/leave/requests?view=mine')
    const { data } = await res.json()
    setRecords(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'records') fetchRecords()
  }, [tab, fetchRecords])

  const leaveType = leaveTypes.find(t => t.id === selectedType)
  const days = startDate && endDate
    ? differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1
    : 0
  const balance = balances.find(b => b.leave_type_id === selectedType)

  const handleApply = async () => {
    if (!selectedType || !startDate || !endDate || !reason.trim()) {
      toast.error('請填寫所有必填欄位')
      return
    }
    if (leaveType?.advance_days_required > 0) {
      const advanceDays = differenceInCalendarDays(parseISO(startDate), new Date())
      if (advanceDays < leaveType.advance_days_required) {
        toast.error(`此假別需提前 ${leaveType.advance_days_required} 天申請`)
        return
      }
    }
    setLoading(true)
    const res = await fetch('/api/leave/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leave_type_id: selectedType,
        start_date: startDate,
        end_date: endDate,
        half_day: halfDay || null,
        total_days: halfDay ? 0.5 : days,
        reason,
        deputy_id: deputyId || null,
      }),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success('請假申請已送出')
    setApplyOpen(false)
    setSelectedType(''); setStartDate(''); setEndDate(''); setReason(''); setDeputyId(''); setHalfDay('')
    router.refresh()
  }

  const handleApprove = async (id: string, action: 'approve' | 'reject', rejectReason?: string) => {
    const res = await fetch(`/api/leave/requests/${id}`, {
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
          { key: 'balance', label: '假別餘額' },
          { key: 'apply', label: '申請請假' },
          { key: 'records', label: '我的紀錄' },
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

      {/* Balance tab */}
      {tab === 'balance' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {leaveTypes.map(lt => {
              const bal = balances.find(b => b.leave_type_id === lt.id)
              return (
                <div key={lt.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{lt.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{PAY_LABELS[lt.pay_rate]}</p>
                    </div>
                    {lt.max_days_per_year && (
                      <span className="text-xs text-slate-400">上限 {lt.max_days_per_year} 天</span>
                    )}
                  </div>
                  {bal ? (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">可用</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">{bal.remaining_days} 天</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400 mt-0.5">
                        <span>已用 {bal.used_days} / 核配 {bal.allocated_days}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-3">尚未設定額度</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Apply tab */}
      {tab === 'apply' && (
        <div className="max-w-lg">
          <Button onClick={() => setApplyOpen(true)} className="min-h-[44px]">
            <Plus size={16} className="mr-1.5" /> 提交請假申請
          </Button>
        </div>
      )}

      {/* Records tab */}
      {tab === 'records' && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">假別</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">起始</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">結束</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">天數</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">載入中...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">無紀錄</td></tr>
              ) : records.map((r: any) => (
                <tr key={r.id} className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.leave_type?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.start_date}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.end_date}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.total_days}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve tab */}
      {tab === 'approve' && (
        <div className="space-y-3">
          {approvals.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle size={32} className="text-green-400 mx-auto mb-2" />
              <p className="text-slate-500">沒有待審核的請假申請</p>
            </div>
          ) : approvals.map((r: any) => (
            <ApprovalCard key={r.id} request={r} onAction={handleApprove} />
          ))}
        </div>
      )}

      {/* Apply dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>提交請假申請</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">假別</label>
              <Select value={selectedType} onValueChange={v => setSelectedType(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="選擇假別" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {balance && (
                <p className="text-xs text-blue-600 mt-1">可用餘額：{balance.remaining_days} 天</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">開始日期</label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">結束日期</label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1" min={startDate} />
              </div>
            </div>
            {days === 1 && (
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">半天（選填）</label>
                <Select value={halfDay} onValueChange={v => setHalfDay((v ?? '') as '' | 'morning' | 'afternoon')}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="全天" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全天</SelectItem>
                    <SelectItem value="morning">上半天</SelectItem>
                    <SelectItem value="afternoon">下半天</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {days > 0 && (
              <p className="text-sm text-slate-500">共 {halfDay ? 0.5 : days} 天</p>
            )}
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">請假原因</label>
              <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">職務代理人（選填）</label>
              <Select value={deputyId} onValueChange={v => setDeputyId(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="不指定" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不指定</SelectItem>
                  {colleagues.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
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

function ApprovalCard({ request, onAction }: { request: any, onAction: (id: string, action: 'approve' | 'reject', reason?: string) => void }) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-200">{request.user?.display_name}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {request.leave_type?.name} · {request.start_date} ~ {request.end_date} ({request.total_days} 天)
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
          <DialogHeader><DialogTitle>退回請假申請</DialogTitle></DialogHeader>
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
