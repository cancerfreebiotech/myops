'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { LogIn, LogOut, MapPin, AlertTriangle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { MakeupRequestDialog } from './MakeupRequestDialog'
import {
  AdminAttendanceClient,
  type AttendanceRecord as AdminAttendanceRecord,
  type User as AdminAttendanceUser,
} from '@/app/(dashboard)/admin/attendance/AdminAttendanceClient'

interface CurrentUser {
  id: string
  role: string
  employment_type: string
  display_name: string | null
  department_id: string | null
}

interface AttendanceRecord {
  id: string
  clock_date: string
  clock_in: string | null
  clock_out: string | null
  is_auto_in: boolean
  is_auto_out: boolean
}

export type AttendanceTab = 'clock' | 'records' | 'all'

/** 「全員紀錄」分頁的伺端資料（＝原本「打卡紀錄管理」頁餵給 AdminAttendanceClient 的那一份） */
export interface AllRecordsData {
  attendanceRecords: AdminAttendanceRecord[]
  allUsers: AdminAttendanceUser[]
  month: string
  userId: string
  employmentType: string
  todayClockedIn: number
  avgDays: number
  autoMakeupCount: number
}

interface Props {
  currentUser: CurrentUser
  isHR: boolean
  /** 由 page.tsx 從 `?tab=` 解出，tab 狀態的唯一來源 */
  tab: AttendanceTab
  /** 只有 isHR 且 tab === 'all' 時才有值 */
  allRecords: AllRecordsData | null
}

export function AttendanceClient({ currentUser, isHR, tab, allRecords }: Props) {
  const t = useTranslations('attendance')
  const tx = useTranslations('attendance.clientExtra')
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [clocking, setClocking] = useState(false)
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'))
  const [makeupOpen, setMakeupOpen] = useState(false)
  const [pendingMakeupIn, setPendingMakeupIn] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'getting' | 'ok' | 'denied'>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const fetchTodayRecord = useCallback(() => {
    return fetch('/api/attendance/clock')
      .then(res => res.json())
      .then(({ data, pending_makeup_in }) => {
        setTodayRecord(data ?? null)
        setPendingMakeupIn(pending_makeup_in === true)
      })
  }, [])

  useEffect(() => { fetchTodayRecord() }, [fetchTodayRecord])

  // 「我的紀錄」改由 tab + 年月驅動自動重取：深連結 ?tab=records 也要有資料，
  // 且換年/月不必在每個 onChange 手動呼叫。
  useEffect(() => {
    if (tab !== 'records') return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const params = new URLSearchParams({ year: filterYear, month: filterMonth, user_id: currentUser.id })
      try {
        const res = await fetch(`/api/attendance/records?${params}`)
        const { data } = await res.json()
        if (!cancelled) setRecords(data ?? [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tab, filterYear, filterMonth, currentUser.id])

  const getGPS = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return }
      setGpsStatus('getting')
      navigator.geolocation.getCurrentPosition(
        pos => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setCoords(c)
          setGpsStatus('ok')
          resolve(c)
        },
        () => { setGpsStatus('denied'); resolve(null) },
        { timeout: 8000 }
      )
    })
  }

  const handleClock = async (action: 'in' | 'out') => {
    setClocking(true)
    const gps = await getGPS()
    const res = await fetch('/api/attendance/clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, lat: gps?.lat, lng: gps?.lng }),
    })
    const { data, error, code } = await res.json()
    setClocking(false)
    if (error) {
      if (code === 'GEOFENCE_NO_LOCATION') setGpsStatus('denied')
      toast.error(error)
      return
    }
    toast.success(`${action === 'in' ? t('clockInSuccess') : t('clockOutSuccess')} ${format(parseISO(data.time), 'HH:mm')}`)
    fetchTodayRecord()
  }

  // 切分頁只改 URL（不帶舊參數），離開 all 分頁時 month/user_id/employment_type 自然清掉
  const goTab = (next: AttendanceTab) => {
    if (next === tab) return
    startTransition(() => {
      router.push(next === 'clock' ? pathname : `${pathname}?tab=${next}`)
    })
  }

  const canClockIn = !todayRecord?.clock_in
  // 沒有上班卡但有 pending 的上班補卡申請時仍可打下班卡（feedback 6e585611），
  // 補卡核准後會補回同一列的 clock_in
  const canClockOut = (todayRecord?.clock_in || pendingMakeupIn) && !todayRecord?.clock_out

  const now = new Date()
  const years = [String(now.getFullYear()), String(now.getFullYear() - 1)]
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {[
          { key: 'clock' as const, label: t('title') },
          { key: 'records' as const, label: t('myRecords') },
          ...(isHR ? [{ key: 'all' as const, label: t('tabAllRecords') }] : []),
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => goTab(item.key)}
            disabled={pending}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer disabled:cursor-wait ${
              tab === item.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Clock tab */}
      {tab === 'clock' && (
        <div className="max-w-sm mx-auto space-y-4">
          {/* Today status */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 text-center">
            <p className="text-xs text-slate-400 mb-1">{format(now, tx('todayDateFormat'))}</p>
            <p className="text-4xl font-bold text-slate-900 dark:text-slate-100 font-mono">
              {format(now, 'HH:mm')}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-3">
                <p className="text-xs text-slate-400 mb-0.5">{t('clockInLabel')}</p>
                <p className={`font-medium ${todayRecord?.clock_in ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                  {todayRecord?.clock_in ? format(parseISO(todayRecord.clock_in), 'HH:mm') : '—'}
                  {todayRecord?.is_auto_in && <span className="ml-1 text-xs text-amber-500">({t('auto')})</span>}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-3">
                <p className="text-xs text-slate-400 mb-0.5">{t('clockOutLabel')}</p>
                <p className={`font-medium ${todayRecord?.clock_out ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                  {todayRecord?.clock_out ? format(parseISO(todayRecord.clock_out), 'HH:mm') : '—'}
                  {todayRecord?.is_auto_out && <span className="ml-1 text-xs text-amber-500">({t('auto')})</span>}
                </p>
              </div>
            </div>
          </div>

          {/* GPS status */}
          {gpsStatus === 'denied' && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
              <AlertTriangle size={15} />
              <span>{t('gpsNoLocation')}</span>
            </div>
          )}
          {gpsStatus === 'ok' && coords && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <MapPin size={13} /> <span>{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>
            </div>
          )}

          {/* Clock buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className="min-h-[56px] text-base"
              disabled={!canClockIn || clocking}
              onClick={() => handleClock('in')}
            >
              <LogIn size={18} className="mr-2" />
              {t('clockIn')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="min-h-[56px] text-base border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400"
              disabled={!canClockOut || clocking}
              onClick={() => handleClock('out')}
            >
              <LogOut size={18} className="mr-2" />
              {t('clockOut')}
            </Button>
          </div>

          {/* Makeup request */}
          {!todayRecord?.clock_in && pendingMakeupIn && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              {t('pendingMakeupInHint')}
            </p>
          )}
          <div className="text-center">
            <button
              onClick={() => setMakeupOpen(true)}
              className="text-sm text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
            >
              {t('makeupRequest')}
            </button>
          </div>
        </div>
      )}

      {/* Records tab（我的紀錄） */}
      {tab === 'records' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterYear} onValueChange={v => setFilterYear(v ?? filterYear)}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={v => setFilterMonth(v ?? filterMonth)}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{m} {t('monthSuffix')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <RecordsTable records={records} loading={loading} />
        </>
      )}

      {/* All tab（全員紀錄）：整套沿用原「打卡紀錄管理」的 client，
          extraQuery 讓它換月份/篩選時把 tab=all 帶回來 */}
      {tab === 'all' && isHR && allRecords && (
        <AdminAttendanceClient
          attendanceRecords={allRecords.attendanceRecords}
          allUsers={allRecords.allUsers}
          initialMonth={allRecords.month}
          initialUserId={allRecords.userId}
          initialEmploymentType={allRecords.employmentType}
          todayClockedIn={allRecords.todayClockedIn}
          avgDays={allRecords.avgDays}
          autoMakeupCount={allRecords.autoMakeupCount}
          extraQuery={{ tab: 'all' }}
        />
      )}

      <MakeupRequestDialog open={makeupOpen} onOpenChange={setMakeupOpen} onSuccess={fetchTodayRecord} />
    </div>
  )
}

function RecordsTable({ records, loading }: { records: AttendanceRecord[], loading: boolean }) {
  const t = useTranslations('attendance')
  const tc = useTranslations('common')
  const workHours = (r: AttendanceRecord) => {
    if (!r.clock_in || !r.clock_out) return null
    const diff = (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000
    return diff.toFixed(1)
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('date')}</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('clockInLabel')}</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('clockOutLabel')}</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('workHours')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {loading ? (
            <tr><td colSpan={4} className="text-center py-8 text-slate-400">{tc('loading')}</td></tr>
          ) : records.length === 0 ? (
            <tr><td colSpan={4} className="text-center py-8 text-slate-400">{t('noRecordsShort')}</td></tr>
          ) : records.map((r) => (
            <tr key={r.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.clock_date}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className={r.is_auto_in ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}>
                    {r.clock_in ? format(parseISO(r.clock_in), 'HH:mm') : <span className="text-slate-400">—</span>}
                  </span>
                  {r.is_auto_in && <Badge variant="outline" className="text-xs py-0 px-1 border-amber-300 text-amber-600">{t('auto')}</Badge>}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className={r.is_auto_out ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}>
                    {r.clock_out ? format(parseISO(r.clock_out), 'HH:mm') : <span className="text-slate-400">—</span>}
                  </span>
                  {r.is_auto_out && <Badge variant="outline" className="text-xs py-0 px-1 border-amber-300 text-amber-600">{t('auto')}</Badge>}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                {workHours(r) ? (
                  <span className="font-medium text-slate-700 dark:text-slate-300">{workHours(r)} h</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
