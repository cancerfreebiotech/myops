'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, X, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { taipeiToday } from '@/lib/taipei-date'
import { RecordsFilterBar, RecordsPagination, type RecordsFilterOption } from '@/components/records/RecordsFilterBar'

// 全員紀錄分頁大小，與打卡紀錄管理（AdminAttendanceClient）一致
const PAGE_SIZE = 20

interface Trip {
  id: string
  user_id: string
  destination: string
  purpose: string
  start_date: string
  end_date: string
  itinerary: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reject_reason: string | null
  user: { id: string; display_name: string | null } | null
  approver: { display_name: string | null } | null
}

interface Props {
  showApproveTab: boolean
  isHR: boolean
}

type Tab = 'mine' | 'new' | 'approve' | 'all'

const STATUS_KEYS = {
  pending: 'statusPending', approved: 'statusApproved',
  rejected: 'statusRejected', cancelled: 'statusCancelled',
} as const

const STATUS_COLORS: Record<Trip['status'], string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
  approved: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
  rejected: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
}

const tripDays = (t: Trip) =>
  Math.round((new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86_400_000) + 1

export function BusinessTripsClient({ showApproveTab, isHR }: Props) {
  const t = useTranslations('businessTrip')
  const tc = useTranslations('common')
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('mine')
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)

  // New trip form
  const [destination, setDestination] = useState('')
  const [purpose, setPurpose] = useState('')
  const [startDate, setStartDate] = useState(() => taipeiToday())
  const [endDate, setEndDate] = useState(() => taipeiToday())
  const [itinerary, setItinerary] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 全員紀錄 tab 的篩選/分頁狀態：純前端篩選 view=all 抓回來的 trips，不另外打 API
  const [allMonth, setAllMonth] = useState('')
  const [allEmployeeId, setAllEmployeeId] = useState('')
  const [allStatus, setAllStatus] = useState<Trip['status'] | 'all'>('all')
  const [allPage, setAllPage] = useState(1)

  // HR 全員檢視走 view=all（見 /api/business-trips route.ts），唯讀，無審批動作
  const view = tab === 'approve' ? 'approve' : tab === 'all' ? 'all' : 'mine'

  const loadTrips = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/business-trips?view=${view}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setTrips(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [view, t])

  useEffect(() => {
    const load = async () => { await loadTrips() }
    load()
  }, [loadTrips])

  const submitTrip = async () => {
    if (!destination.trim() || !purpose.trim() || !startDate || !endDate || endDate < startDate) {
      toast.error(t('requiredFields'))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/business-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: destination.trim(),
          purpose: purpose.trim(),
          start_date: startDate,
          end_date: endDate,
          itinerary: itinerary.trim() || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('submitted'))
      setDestination('')
      setPurpose('')
      setStartDate(taipeiToday())
      setEndDate(taipeiToday())
      setItinerary('')
      setTab('mine')
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const patchTrip = async (id: string, body: Record<string, unknown>, successMsg: string) => {
    const res = await fetch(`/api/business-trips/${id}`, {
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
    await loadTrips()
  }

  const cancelTrip = async (id: string) => {
    if (!confirm(t('cancelConfirm'))) return
    await patchTrip(id, { action: 'cancel' }, t('cancelled'))
  }

  const approveTrip = (id: string) => patchTrip(id, { action: 'approve' }, t('approved'))
  const rejectTrip = (id: string) => {
    const reason = prompt(t('rejectReason'))
    if (reason === null) return
    patchTrip(id, { action: 'reject', reject_reason: reason }, t('rejected'))
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mine', label: t('tabMine') },
    { key: 'new', label: t('tabNew') },
    ...(showApproveTab ? [{ key: 'approve' as Tab, label: t('tabApprove') }] : []),
    ...(isHR ? [{ key: 'all' as Tab, label: t('tabAllRecords') }] : []),
  ]

  // 員工下拉選項從已載入的全員紀錄（view=all）去重取得，不另外打 API
  const employeeOptions: RecordsFilterOption[] = useMemo(() => {
    const map = new Map<string, string>()
    trips.forEach(tr => {
      if (tr.user?.id) map.set(tr.user.id, tr.user.display_name ?? tr.user.id)
    })
    return Array.from(map, ([value, label]) => ({ value, label }))
  }, [trips])

  // 狀態下拉選項沿用卡片本身的顯示方式（businessTrip.status* 系列 key，非 common.*）
  const statusOptions: RecordsFilterOption[] = useMemo(() => (
    (Object.keys(STATUS_KEYS) as Trip['status'][]).map(s => ({ value: s, label: t(STATUS_KEYS[s]) }))
  ), [t])

  const filteredAllTrips = useMemo(() => {
    return trips.filter(tr => {
      if (allMonth && !tr.start_date.startsWith(allMonth)) return false
      if (allEmployeeId && tr.user?.id !== allEmployeeId) return false
      if (allStatus !== 'all' && tr.status !== allStatus) return false
      return true
    })
  }, [trips, allMonth, allEmployeeId, allStatus])

  const allTotalPages = Math.max(1, Math.ceil(filteredAllTrips.length / PAGE_SIZE))
  const pagedAllTrips = filteredAllTrips.slice((allPage - 1) * PAGE_SIZE, allPage * PAGE_SIZE)

  const renderTrip = (trip: Trip) => (
    <Card key={trip.id}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {trip.destination}
              </span>
              <Badge className={`text-xs border ${STATUS_COLORS[trip.status]}`}>{t(STATUS_KEYS[trip.status])}</Badge>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 break-words">{trip.purpose}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-slate-400 tabular-nums">
                {trip.start_date} ~ {trip.end_date}（{tripDays(trip)} {t('days')}）
              </span>
              {(tab === 'approve' || tab === 'all') && trip.user && (
                <span className="text-xs text-slate-400">{t('applicant')}: {trip.user.display_name}</span>
              )}
              {trip.approver && (
                <span className="text-xs text-slate-400">{t('approver')}: {trip.approver.display_name}</span>
              )}
              {trip.reject_reason && (
                <span className="text-xs text-slate-400">「{trip.reject_reason}」</span>
              )}
            </div>
            {trip.itinerary && (
              <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap break-words">{trip.itinerary}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {tab === 'mine' && trip.status === 'pending' && (
              <Button
                variant="ghost" size="icon" onClick={() => cancelTrip(trip.id)}
                aria-label={t('cancelTrip')}
                className="text-slate-400 hover:text-red-500 h-8 w-8"
              >
                <Trash2 size={14} />
              </Button>
            )}
            {tab === 'mine' && trip.status === 'approved' && (
              <Button
                variant="ghost" size="sm"
                onClick={() => router.push(`/expenses?trip=${trip.id}`)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                <Receipt size={14} className="mr-1" />{t('createExpense')}
              </Button>
            )}
            {tab === 'approve' && trip.status === 'pending' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => approveTrip(trip.id)} className="text-xs text-green-600 hover:text-green-700">
                  <Check size={14} className="mr-1" />{t('approve')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => rejectTrip(trip.id)} className="text-xs text-red-500 hover:text-red-600">
                  <X size={14} className="mr-1" />{t('reject')}
                </Button>
              </>
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
      </div>

      {/* New trip form */}
      {tab === 'new' && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-48">
                <label htmlFor="trip-destination" className="block text-xs text-slate-500 mb-1">
                  {t('destination')} <span className="text-red-500">*</span>
                </label>
                <Input
                  id="trip-destination"
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="trip-start-date" className="block text-xs text-slate-500 mb-1">
                  {t('startDate')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="trip-start-date"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="trip-end-date" className="block text-xs text-slate-500 mb-1">
                  {t('endDate')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="trip-end-date"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="trip-purpose" className="block text-xs text-slate-500 mb-1">
                {t('purpose')} <span className="text-red-500">*</span>
              </label>
              <Input
                id="trip-purpose"
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="trip-itinerary" className="block text-xs text-slate-500 mb-1">{t('itinerary')}</label>
              <Textarea
                id="trip-itinerary"
                value={itinerary}
                onChange={e => setItinerary(e.target.value)}
                rows={3}
              />
            </div>
            <Button onClick={submitTrip} disabled={submitting}>
              <Plus size={14} className="mr-1" />{submitting ? t('submitting') : t('submit')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* All records tab（HR 全員檢視，唯讀；核准動作仍留在待審核 tab） */}
      {tab === 'all' && (
        <div className="space-y-4">
          <RecordsFilterBar
            month={allMonth}
            onMonthChange={v => { setAllMonth(v); setAllPage(1) }}
            allowAllMonths
            employees={employeeOptions}
            employeeId={allEmployeeId}
            onEmployeeChange={v => { setAllEmployeeId(v); setAllPage(1) }}
            statuses={statusOptions}
            status={allStatus}
            onStatusChange={v => { setAllStatus(v as Trip['status'] | 'all'); setAllPage(1) }}
            totalCount={loading ? undefined : filteredAllTrips.length}
          />
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-2 space-y-2">
              {loading && <p className="text-sm text-slate-400 text-center py-8">…</p>}
              {!loading && pagedAllTrips.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">{tc('recordFilters.noRecordsHint')}</p>
              )}
              {pagedAllTrips.map(renderTrip)}
            </div>
            <RecordsPagination
              page={allPage}
              totalPages={allTotalPages}
              totalCount={filteredAllTrips.length}
              onPageChange={setAllPage}
            />
          </div>
        </div>
      )}

      {/* Trips list（我的出差／待審核；全員紀錄改走上面的篩選＋分頁版本） */}
      {tab !== 'new' && tab !== 'all' && (
        <div className="space-y-2">
          {loading && <p className="text-sm text-slate-400">…</p>}
          {!loading && trips.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              {tab === 'approve' ? t('noPending') : t('noTrips')}
            </p>
          )}
          {trips.map(renderTrip)}
        </div>
      )}
    </div>
  )
}
