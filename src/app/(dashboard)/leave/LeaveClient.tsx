'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { QualificationSection } from './QualificationSection'
import { RecordsFilterBar, RecordsPagination, type RecordsFilterOption } from '@/components/records/RecordsFilterBar'
import { toast } from 'sonner'
import { Plus, CheckCircle, XCircle, Ban, Info } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { taipeiToday } from '@/lib/taipei-date'

// 「全員紀錄」分頁大小，沿用 AdminAttendanceClient 的慣例（見該檔案）
const PAGE_SIZE = 20

interface CurrentUser {
  id: string
  role: string
  employment_type: string
  department_id: string | null
  manager_id: string | null
  display_name: string | null
}

interface LeaveType {
  id: string
  name: string
  applies_to: string
  pay_rate: string
  max_days_per_year: number | null
  advance_days_required: number
  requires_qualification: boolean
}

interface LeaveBalance {
  leave_type_id: string
  allocated_days: number
  used_days: number
  remaining_days: number
}

interface Colleague {
  id: string
  display_name: string | null
}

export interface LeaveRequest {
  id: string
  start_date: string
  end_date: string
  total_days: number
  status: string
  reason: string | null
  user?: { id: string; display_name: string | null } | null
  leave_type?: { name: string } | null
}

interface Props {
  currentUser: CurrentUser | null
  leaveTypes: LeaveType[]
  balances: LeaveBalance[]
  /** 曾獲核給任一額度列（total_days > 0）的假別 id —— 特殊假別資格判定，與 API 端一致 */
  qualifiedTypeIds: string[]
  colleagues: Colleague[]
  pendingApprovals: LeaveRequest[]
  isHR: boolean
}

export function LeaveClient({ leaveTypes, balances, qualifiedTypeIds, colleagues, pendingApprovals, isHR }: Props) {
  const router = useRouter()
  const t = useTranslations('leave')
  const tc = useTranslations('common')
  const [tab, setTab] = useState<'apply' | 'records' | 'approve' | 'balance' | 'qualification' | 'all'>('balance')
  const [records, setRecords] = useState<LeaveRequest[]>([])
  const [allRecords, setAllRecords] = useState<LeaveRequest[]>([])
  const [allLoading, setAllLoading] = useState(false)
  const [approvals, setApprovals] = useState(pendingApprovals)
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null)
  // 撤銷已核准請假的確認對話框；fromAll 記住是從「全員紀錄」還是「我的紀錄」按下的，
  // 才知道成功後該重抓哪個列表（見 handleCancel）
  const [revokeConfirm, setRevokeConfirm] = useState<{ id: string; fromAll: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)

  // 用來判斷「假是否已開始」→ 已開始的假只有人資能撤銷（與後端 taipeiToday 同一基準）
  const taipeiTodayStr = useMemo(() => taipeiToday(), [])

  // All records tab 篩選狀態（實際過濾邏輯見下方 filteredAllRecords 的 useMemo）
  const [allMonth, setAllMonth] = useState('')
  const [allEmployeeId, setAllEmployeeId] = useState('')
  const [allStatus, setAllStatus] = useState('all')
  const [allPage, setAllPage] = useState(1)

  // Apply form state
  const [selectedType, setSelectedType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [halfDay, setHalfDay] = useState<'' | 'morning' | 'afternoon'>('')
  const [reason, setReason] = useState('')
  const [deputyId, setDeputyId] = useState('')

  const PAY_LABELS: Record<string, string> = { full: t('payFull'), half: t('payHalf'), none: t('payNone') }

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/leave/requests?view=mine')
    const { data } = await res.json()
    setRecords(data ?? [])
    setLoading(false)
  }, [])

  // HR 全員紀錄（唯讀）：後端 view=team 僅 admin/HR 可回傳全部，見 route.ts
  const fetchAllRecords = useCallback(async () => {
    setAllLoading(true)
    const res = await fetch('/api/leave/requests?view=team')
    const { data } = await res.json()
    setAllRecords(data ?? [])
    setAllLoading(false)
  }, [])

  const leaveType = leaveTypes.find(t => t.id === selectedType)
  const days = startDate && endDate
    ? differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1
    : 0
  const balance = balances.find(b => b.leave_type_id === selectedType)
  // T9 特殊假別：需 HR 先審核資格並核給額度才可申請。
  // 資格＝「曾獲核給」（qualifiedTypeIds，不限年度），與 API 端一致；
  // 不可用當期餘額判斷——年底申請隔年假時當期無列會誤判為未核給。
  const needsQualification = !!leaveType?.requires_qualification && !qualifiedTypeIds.includes(selectedType)

  const handleApply = async () => {
    if (!selectedType || !startDate || !endDate || !reason.trim()) {
      toast.error(t('requiredFields'))
      return
    }
    if (leaveType && leaveType.advance_days_required > 0) {
      const advanceDays = differenceInCalendarDays(parseISO(startDate), new Date())
      if (advanceDays < leaveType.advance_days_required) {
        toast.error(t('advanceDaysRequired', { days: leaveType.advance_days_required }))
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
    toast.success(t('applicationSubmitted'))
    setApplyOpen(false)
    setSelectedType(''); setStartDate(''); setEndDate(''); setReason(''); setDeputyId(''); setHalfDay('')
    router.refresh()
  }

  // action: 'cancel' 同時涵蓋「取消待審」與「撤銷已核准」，後端依單子原狀態決定語意（見 A1 回報）。
  // opts.revoke 只影響成功 toast 文案；opts.fromAll 決定成功/409 後重抓哪個列表。
  const handleCancel = async (id: string, opts?: { revoke?: boolean; fromAll?: boolean }) => {
    const res = await fetch(`/api/leave/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    const { error, code } = await res.json()
    if (code === 'MFA_REQUIRED') { toast.error(error); router.push('/mfa/verify'); return }
    if (error) {
      toast.error(error)
      // 409（併發：單子已被他人改掉，例如同時被核准/撤銷）：自動重抓，讓畫面立即反映
      // 真實狀態，避免殘留一顆點了也沒用的操作按鈕
      if (code === 'ALREADY_PROCESSED') {
        if (opts?.fromAll) fetchAllRecords(); else fetchRecords()
      }
      return
    }
    toast.success(opts?.revoke ? t('leaveRevoked') : t('applicationCancelled'))
    setCancelConfirm(null)
    setRevokeConfirm(null)
    if (opts?.fromAll) fetchAllRecords(); else fetchRecords()
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
    toast.success(action === 'approve' ? tc('approved') : tc('rejected'))
    setApprovals(prev => prev.filter(r => r.id !== id))
  }

  // 員工下拉選項：從已載入的 allRecords 去重取得申請人清單，不另外打 API
  const allEmployeeOptions: RecordsFilterOption[] = useMemo(() => {
    const seen = new Map<string, string>()
    allRecords.forEach(r => {
      if (r.user?.id && !seen.has(r.user.id)) seen.set(r.user.id, r.user.display_name ?? r.user.id)
    })
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [allRecords])

  const allStatusOptions: RecordsFilterOption[] = [
    { value: 'pending', label: tc('pending') },
    { value: 'approved', label: tc('approved') },
    { value: 'rejected', label: tc('rejected') },
    { value: 'cancelled', label: tc('cancelled') },
  ]

  // all tab 的資料本來就一次抓進來（view=team），篩選/分頁一律前端做，不改後端 API
  const filteredAllRecords = useMemo(() => allRecords.filter(r => {
    if (allMonth && !r.start_date.startsWith(allMonth)) return false
    if (allEmployeeId && r.user?.id !== allEmployeeId) return false
    if (allStatus !== 'all' && r.status !== allStatus) return false
    return true
  }), [allRecords, allMonth, allEmployeeId, allStatus])
  const allTotalCount = filteredAllRecords.length
  const allTotalPages = Math.max(1, Math.ceil(allTotalCount / PAGE_SIZE))
  const pagedAllRecords = filteredAllRecords.slice((allPage - 1) * PAGE_SIZE, allPage * PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {[
          { key: 'balance' as const, label: t('tabBalance') },
          { key: 'apply' as const, label: t('tabApply') },
          { key: 'records' as const, label: t('tabMyRecords') },
          ...(leaveTypes.some(lt => lt.requires_qualification) || isHR ? [{ key: 'qualification' as const, label: t('specialLeaveTab') }] : []),
          ...(pendingApprovals.length > 0 || isHR ? [{ key: 'approve' as const, label: t('tabPendingApproval'), badge: approvals.length }] : []),
          ...(isHR ? [{ key: 'all' as const, label: t('tabAllRecords') }] : []),
        ].map((t: { key: 'apply' | 'records' | 'approve' | 'balance' | 'qualification' | 'all'; label: string; badge?: number }) => (
          <button
            key={t.key}
            onClick={() => {
              if (t.key === 'records' && tab !== 'records') fetchRecords()
              if (t.key === 'all' && tab !== 'all') fetchAllRecords()
              setTab(t.key)
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
            {(t.badge ?? 0) > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs bg-red-500 text-gray-50 rounded-full">{t.badge}</span>
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{lt.name}</p>
                        {lt.requires_qualification && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                            {t('requiresQualificationBadge')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{PAY_LABELS[lt.pay_rate]}</p>
                    </div>
                    {lt.max_days_per_year && (
                      <span className="text-xs text-slate-400">{t('maxDaysLimit', { days: lt.max_days_per_year })}</span>
                    )}
                  </div>
                  {bal ? (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">{t('available')}</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">{bal.remaining_days} {t('daysUnit')}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400 mt-0.5">
                        <span>{t('usedOf', { used: bal.used_days, allocated: bal.allocated_days })}</span>
                      </div>
                    </div>
                  ) : lt.requires_qualification ? (
                    <p className="text-xs text-slate-400 mt-3">{t('qualificationNotGranted')}</p>
                  ) : lt.max_days_per_year != null ? (
                    // HR 尚未建立 leave_balances 列時，改顯示法定額度（product 決策）取代「尚未設定額度」，
                    // 用 muted 樣式 + 提示文字區分於「HR 已核定」的額度，避免員工誤以為是正式核給天數。
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">{t('available')}</span>
                        <span className="font-bold text-slate-400 dark:text-slate-500">{lt.max_days_per_year} {t('daysUnit')}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{t('defaultQuotaHint')}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-3">{t('notAllocated')}</p>
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
            <Plus size={16} className="mr-1.5" /> {t('submitLeaveApplication')}
          </Button>
        </div>
      )}

      {/* Records tab */}
      {tab === 'records' && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('leaveType')}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('startDate')}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('endDate')}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('totalDays')}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('status')}</th>
              <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">{tc('loading')}</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">{t('noRecords')}</td></tr>
              ) : records.map((r) => (
                <tr key={r.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.leave_type?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.start_date}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.end_date}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.total_days}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">
                    {r.status === 'pending' && (
                      <Button
                        size="sm" variant="ghost"
                        className="min-h-[44px] text-xs text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                        onClick={() => setCancelConfirm(r.id)}
                        aria-label={t('cancelAriaLabel')}
                      >
                        <Ban size={16} className="mr-1" /> {tc('cancel')}
                      </Button>
                    )}
                    {/* 已核准可撤銷（會退還額度），語意不同於「取消」故用獨立按鈕/對話框。
                        已開始（含今天）的假只有人資能撤銷 —— 後端會擋，這裡同步不顯示按鈕，
                        避免使用者按了才看到 403。人資撤銷的入口在「全員紀錄」分頁。 */}
                    {r.status === 'approved' && (isHR || r.start_date > taipeiTodayStr) && (
                      <Button
                        size="sm" variant="ghost"
                        className="min-h-[44px] text-xs text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                        onClick={() => setRevokeConfirm({ id: r.id, fromAll: false })}
                        aria-label={t('cancelApprovedAriaLabel')}
                      >
                        <Ban size={16} className="mr-1" /> {t('cancelApproved')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All records tab（HR 全員檢視；核准/退回動作仍留在待審核 tab，這裡只多了撤銷已核准） */}
      {tab === 'all' && (
        <div className="space-y-3">
          {/* 載入中把 totalCount 傳 undefined：否則會先閃一下「請確認篩選條件」再跳出真實筆數（與加班/出差頁一致） */}
          <RecordsFilterBar
            month={allMonth}
            onMonthChange={m => { setAllMonth(m); setAllPage(1) }}
            allowAllMonths
            employees={allEmployeeOptions}
            employeeId={allEmployeeId}
            onEmployeeChange={id => { setAllEmployeeId(id); setAllPage(1) }}
            statuses={allStatusOptions}
            status={allStatus}
            onStatusChange={s => { setAllStatus(s); setAllPage(1) }}
            totalCount={allLoading ? undefined : allTotalCount}
          />
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('employee')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('leaveType')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('startDate')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('endDate')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('totalDays')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('status')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {allLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">{tc('loading')}</td></tr>
                ) : pagedAllRecords.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">{tc('recordFilters.noRecordsHint')}</td></tr>
                ) : pagedAllRecords.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.user?.display_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.leave_type?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.start_date}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.end_date}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.total_days}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      {/* HR/admin 代撤他人已核准的假（使用者回報「管理員也無法取消」的另一半，
                          後端授權已擋好，這裡只是把入口露出來） */}
                      {isHR && r.status === 'approved' && (
                        <Button
                          size="sm" variant="ghost"
                          className="min-h-[44px] text-xs text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                          onClick={() => setRevokeConfirm({ id: r.id, fromAll: true })}
                          aria-label={t('cancelApprovedAriaLabel')}
                        >
                          <Ban size={16} className="mr-1" /> {t('cancelApproved')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <RecordsPagination
              page={allPage}
              totalPages={allTotalPages}
              totalCount={allTotalCount}
              onPageChange={setAllPage}
            />
          </div>
        </div>
      )}

      {/* Approve tab */}
      {tab === 'approve' && (
        <div className="space-y-3">
          {approvals.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle size={32} className="text-green-400 mx-auto mb-2" />
              <p className="text-slate-500">{t('noApprovals')}</p>
            </div>
          ) : approvals.map((r) => (
            <ApprovalCard key={r.id} request={r} onAction={handleApprove} />
          ))}
        </div>
      )}

      {/* Special-leave qualification tab（回報4：特殊假需先申請審核資格） */}
      {tab === 'qualification' && (
        <QualificationSection leaveTypes={leaveTypes} isHR={isHR} />
      )}

      {/* Cancel confirm dialog */}
      <Dialog open={!!cancelConfirm} onOpenChange={() => setCancelConfirm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t('cancelConfirm')}</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">{t('cancelDescription')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConfirm(null)}>{tc('back')}</Button>
            <Button variant="destructive" className="cursor-pointer" onClick={() => cancelConfirm && handleCancel(cancelConfirm)}>{t('confirmCancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke (撤銷已核准) confirm dialog —— 與 cancelConfirm 語意不同，不共用：撤銷會退還額度、
          刪除已同步的 Outlook 事件，且可能是 HR 代撤，文案需明確告知後果 */}
      <Dialog open={!!revokeConfirm} onOpenChange={() => setRevokeConfirm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t('cancelApprovedConfirm')}</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">{t('cancelApprovedDescription')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeConfirm(null)}>{tc('cancel')}</Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={() => revokeConfirm && handleCancel(revokeConfirm.id, { revoke: true, fromAll: revokeConfirm.fromAll })}
            >
              {t('confirmCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t('submitLeaveApplication')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('leaveType')}</label>
              <Select value={selectedType} onValueChange={v => setSelectedType(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t('selectType')} /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {balance && (
                <p className="text-xs text-blue-600 mt-1">{t('availableBalance', { days: balance.remaining_days })}</p>
              )}
              {needsQualification && (
                <div className="flex items-start gap-2 mt-2 p-3 rounded-lg border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" role="status">
                  <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-xs text-blue-800 dark:text-blue-300">{t('qualificationNotice')}</p>
                    <button
                      type="button"
                      onClick={() => { setApplyOpen(false); setTab('qualification') }}
                      className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300 underline cursor-pointer"
                    >
                      {t('specialLeaveApply')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('startDate')}</label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('endDate')}</label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1" min={startDate} />
              </div>
            </div>
            {days === 1 && (
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('halfDayOptional')}</label>
                <Select value={halfDay} onValueChange={v => setHalfDay((v ?? '') as '' | 'morning' | 'afternoon')}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={t('fullDay')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('fullDay')}</SelectItem>
                    <SelectItem value="morning">{t('morning')}</SelectItem>
                    <SelectItem value="afternoon">{t('afternoon')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {days > 0 && (
              <p className="text-sm text-slate-500">{t('totalDaysCount', { days: halfDay ? 0.5 : days })}</p>
            )}
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('leaveReason')}</label>
              <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('deputyOptional')}</label>
              <Select value={deputyId} onValueChange={v => setDeputyId(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t('noDeputy')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('noDeputy')}</SelectItem>
                  {colleagues.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleApply} disabled={loading || needsQualification}>{loading ? tc('submitting') : t('submitApplication')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ApprovalCard({ request, onAction }: { request: LeaveRequest, onAction: (id: string, action: 'approve' | 'reject', reason?: string) => void }) {
  const t = useTranslations('leave')
  const tc = useTranslations('common')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-200">{request.user?.display_name}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {request.leave_type?.name} · {request.start_date} ~ {request.end_date} ({request.total_days} {t('daysUnit')})
          </p>
          {request.reason && <p className="text-sm text-slate-400 mt-1">{request.reason}</p>}
        </div>
        <StatusBadge status={request.status} />
      </div>
      {request.status === 'pending' && (
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" className="min-h-[36px]" onClick={() => onAction(request.id, 'approve')}>
            <CheckCircle size={13} className="mr-1" /> {tc('approve')}
          </Button>
          <Button size="sm" variant="outline" className="min-h-[36px] border-red-200 text-red-600 hover:bg-red-50" onClick={() => setRejectOpen(true)}>
            <XCircle size={13} className="mr-1" /> {tc('reject')}
          </Button>
        </div>
      )}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('rejectLeaveTitle')}</DialogTitle></DialogHeader>
          <Textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder={t('rejectReason')} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={() => { onAction(request.id, 'reject', rejectReason); setRejectOpen(false) }}>{t('confirmReject')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
