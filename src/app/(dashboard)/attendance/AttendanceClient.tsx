'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { LogIn, LogOut, MapPin, AlertTriangle, Clock } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { MakeupRequestDialog } from './MakeupRequestDialog'

interface Props {
  currentUser: any
  departments: any[]
  isHR: boolean
}

export function AttendanceClient({ currentUser, departments, isHR }: Props) {
  const [todayRecord, setTodayRecord] = useState<any>(null)
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [clocking, setClocking] = useState(false)
  const [tab, setTab] = useState<'clock' | 'records' | 'team'>('clock')
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'))
  const [filterDept, setFilterDept] = useState('')
  const [makeupOpen, setMakeupOpen] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'getting' | 'ok' | 'denied'>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const fetchTodayRecord = useCallback(async () => {
    const res = await fetch('/api/attendance/clock')
    const { data } = await res.json()
    setTodayRecord(data ?? null)
  }, [])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ year: filterYear, month: filterMonth })
    if (tab === 'team' && filterDept) params.set('department_id', filterDept)
    else if (tab === 'records') params.set('user_id', currentUser.id)
    const res = await fetch(`/api/attendance/records?${params}`)
    const { data } = await res.json()
    setRecords(data ?? [])
    setLoading(false)
  }, [filterYear, filterMonth, filterDept, tab, currentUser.id])

  useEffect(() => { fetchTodayRecord() }, [fetchTodayRecord])
  useEffect(() => {
    if (tab !== 'clock') fetchRecords()
  }, [tab, fetchRecords])

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
    const { data, error } = await res.json()
    setClocking(false)
    if (error) { toast.error(error); return }
    toast.success(action === 'in' ? `上班打卡成功 ${format(parseISO(data.time), 'HH:mm')}` : `下班打卡成功 ${format(parseISO(data.time), 'HH:mm')}`)
    fetchTodayRecord()
  }

  const canClockIn = !todayRecord?.clock_in
  const canClockOut = todayRecord?.clock_in && !todayRecord?.clock_out

  const now = new Date()
  const years = [String(now.getFullYear()), String(now.getFullYear() - 1)]
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

  const workHours = (record: any) => {
    if (!record.clock_in || !record.clock_out) return null
    const diff = (new Date(record.clock_out).getTime() - new Date(record.clock_in).getTime()) / 3600000
    return diff.toFixed(1)
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {[
          { key: 'clock', label: '打卡' },
          { key: 'records', label: '我的紀錄' },
          ...(isHR ? [{ key: 'team', label: '團隊總覽' }] : []),
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
          </button>
        ))}
      </div>

      {/* Clock tab */}
      {tab === 'clock' && (
        <div className="max-w-sm mx-auto space-y-4">
          {/* Today status */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 text-center">
            <p className="text-xs text-slate-400 mb-1">{format(now, 'yyyy年MM月dd日 EEEE')}</p>
            <p className="text-4xl font-bold text-slate-900 dark:text-slate-100 font-mono">
              {format(now, 'HH:mm')}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-3">
                <p className="text-xs text-slate-400 mb-0.5">上班</p>
                <p className={`font-medium ${todayRecord?.clock_in ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                  {todayRecord?.clock_in ? format(parseISO(todayRecord.clock_in), 'HH:mm') : '—'}
                  {todayRecord?.is_auto_in && <span className="ml-1 text-xs text-amber-500">(自動)</span>}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-3">
                <p className="text-xs text-slate-400 mb-0.5">下班</p>
                <p className={`font-medium ${todayRecord?.clock_out ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                  {todayRecord?.clock_out ? format(parseISO(todayRecord.clock_out), 'HH:mm') : '—'}
                  {todayRecord?.is_auto_out && <span className="ml-1 text-xs text-amber-500">(自動)</span>}
                </p>
              </div>
            </div>
          </div>

          {/* GPS status */}
          {gpsStatus === 'denied' && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
              <AlertTriangle size={15} />
              <span>無法取得 GPS 位置，打卡將不含座標</span>
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
              上班打卡
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="min-h-[56px] text-base border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400"
              disabled={!canClockOut || clocking}
              onClick={() => handleClock('out')}
            >
              <LogOut size={18} className="mr-2" />
              下班打卡
            </Button>
          </div>

          {/* Makeup request */}
          <div className="text-center">
            <button
              onClick={() => setMakeupOpen(true)}
              className="text-sm text-slate-400 hover:text-blue-600 transition-colors"
            >
              補打卡申請
            </button>
          </div>
        </div>
      )}

      {/* Records tab */}
      {tab === 'records' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterYear} onValueChange={v => setFilterYear(v ?? filterYear)}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={v => setFilterMonth(v ?? filterMonth)}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{m} 月</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <RecordsTable records={records} loading={loading} showUser={false} />
        </>
      )}

      {/* Team tab */}
      {tab === 'team' && isHR && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterYear} onValueChange={v => setFilterYear(v ?? filterYear)}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={v => setFilterMonth(v ?? filterMonth)}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{m} 月</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={v => setFilterDept(v ?? '')}>
              <SelectTrigger className="w-36"><SelectValue placeholder="所有部門" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">所有部門</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <RecordsTable records={records} loading={loading} showUser={true} />
        </>
      )}

      <MakeupRequestDialog open={makeupOpen} onOpenChange={setMakeupOpen} onSuccess={fetchTodayRecord} />
    </div>
  )
}

function RecordsTable({ records, loading, showUser }: { records: any[], loading: boolean, showUser: boolean }) {
  const workHours = (r: any) => {
    if (!r.clock_in || !r.clock_out) return null
    const diff = (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000
    return diff.toFixed(1)
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            {showUser && <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">員工</th>}
            <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">日期</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">上班</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">下班</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">工時</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {loading ? (
            <tr><td colSpan={showUser ? 5 : 4} className="text-center py-8 text-slate-400">載入中...</td></tr>
          ) : records.length === 0 ? (
            <tr><td colSpan={showUser ? 5 : 4} className="text-center py-8 text-slate-400">無紀錄</td></tr>
          ) : records.map((r: any) => (
            <tr key={r.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
              {showUser && (
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.user?.display_name ?? '—'}</td>
              )}
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.clock_date}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className={r.is_auto_in ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}>
                    {r.clock_in ? format(parseISO(r.clock_in), 'HH:mm') : <span className="text-slate-400">—</span>}
                  </span>
                  {r.is_auto_in && <Badge variant="outline" className="text-xs py-0 px-1 border-amber-300 text-amber-600">自動</Badge>}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className={r.is_auto_out ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}>
                    {r.clock_out ? format(parseISO(r.clock_out), 'HH:mm') : <span className="text-slate-400">—</span>}
                  </span>
                  {r.is_auto_out && <Badge variant="outline" className="text-xs py-0 px-1 border-amber-300 text-amber-600">自動</Badge>}
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
  )
}
