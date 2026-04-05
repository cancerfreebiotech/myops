'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Users, CalendarDays, Bot, ChevronLeft, ChevronRight, Clock } from 'lucide-react'

const PAGE_SIZE = 20

interface AttendanceRecord {
  id: string
  user_id: string
  clock_date: string
  clock_in: string | null
  clock_out: string | null
  is_auto_in: boolean | null
  is_auto_out: boolean | null
  notes: string | null
  user: {
    id: string
    display_name: string
    employment_type: string | null
    department?: { name: string } | null
  } | null
}

interface User {
  id: string
  display_name: string
  employment_type: string | null
  department?: { name: string } | null
}

interface Props {
  attendanceRecords: AttendanceRecord[]
  allUsers: User[]
  initialMonth: string
  initialUserId: string
  initialEmploymentType: string
  todayClockedIn: number
  avgDays: number
  autoMakeupCount: number
}

const formatTime = (t: string | null) => {
  if (!t) return null
  // Handle both time-only "HH:MM:SS" and ISO datetime strings
  if (t.includes('T')) {
    return new Date(t).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return t.substring(0, 5)
}

const employmentTypeLabel: Record<string, string> = {
  full_time: '正職',
  intern: '實習',
  part_time: '兼職',
  contractor: '顧問',
}

export function AdminAttendanceClient({
  attendanceRecords,
  allUsers,
  initialMonth,
  initialUserId,
  initialEmploymentType,
  todayClockedIn,
  avgDays,
  autoMakeupCount,
}: Props) {
  const router = useRouter()
  const t = useTranslations('attendance')
  const tc = useTranslations('common')
  const [month, setMonth] = useState(initialMonth)
  const [userId, setUserId] = useState(initialUserId)
  const [employmentType, setEmploymentType] = useState(initialEmploymentType || 'all')
  const [page, setPage] = useState(1)

  const handleFilter = (newMonth?: string, newUserId?: string, newEmpType?: string) => {
    const m = newMonth ?? month
    const u = newUserId ?? userId
    const e = newEmpType ?? employmentType
    setPage(1)
    const params = new URLSearchParams()
    if (m) params.set('month', m)
    if (u) params.set('user_id', u)
    if (e && e !== 'all') params.set('employment_type', e)
    router.push(`?${params.toString()}`)
  }

  // Client-side filter on loaded records
  const filtered = useMemo(() => {
    return attendanceRecords.filter(r => {
      if (userId && r.user_id !== userId) return false
      if (employmentType !== 'all' && r.user?.employment_type !== employmentType) return false
      return true
    })
  }, [attendanceRecords, userId, employmentType])

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-green-100 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Users size={18} className="text-green-600" aria-hidden="true" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">今日已打卡人數</span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300 font-[Lexend]">
            {todayClockedIn}
          </p>
          <p className="text-xs text-green-600/70 dark:text-green-500 mt-1">今日有上班打卡紀錄</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays size={18} className="text-slate-600 dark:text-slate-400" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-400">本月出勤天數（平均）</span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-700 dark:text-slate-200 font-[Lexend]">
            {avgDays} 天
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">有出勤員工平均出勤日</p>
        </div>

        <div className="rounded-xl border border-yellow-100 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-900 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Bot size={18} className="text-yellow-600" aria-hidden="true" />
            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">自動補打筆數</span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-yellow-700 dark:text-yellow-300 font-[Lexend]">
            {autoMakeupCount}
          </p>
          <p className="text-xs text-yellow-600/70 dark:text-yellow-500 mt-1">本月系統自動補打紀錄</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          {/* Month picker */}
          <div className="flex flex-col gap-1">
            <label htmlFor="month-filter" className="text-xs font-medium text-slate-600 dark:text-slate-400">
              月份
            </label>
            <input
              id="month-filter"
              type="month"
              value={month}
              onChange={e => {
                setMonth(e.target.value)
                handleFilter(e.target.value)
              }}
              className="h-9 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent cursor-pointer"
            />
          </div>

          {/* User filter */}
          <div className="flex flex-col gap-1">
            <label htmlFor="user-filter" className="text-xs font-medium text-slate-600 dark:text-slate-400">
              員工
            </label>
            <select
              id="user-filter"
              value={userId}
              onChange={e => {
                setUserId(e.target.value)
                handleFilter(undefined, e.target.value)
              }}
              className="h-9 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 pr-8 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-600 cursor-pointer appearance-none"
            >
              <option value="">全部員工</option>
              {allUsers.map(u => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
          </div>

          {/* Employment type filter */}
          <div className="flex flex-col gap-1">
            <label htmlFor="emptype-filter" className="text-xs font-medium text-slate-600 dark:text-slate-400">
              員工類型
            </label>
            <select
              id="emptype-filter"
              value={employmentType}
              onChange={e => {
                setEmploymentType(e.target.value)
                handleFilter(undefined, undefined, e.target.value)
              }}
              className="h-9 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 pr-8 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-600 cursor-pointer appearance-none"
            >
              <option value="all">全部類型</option>
              <option value="full_time">正職</option>
              <option value="intern">實習</option>
              <option value="part_time">兼職</option>
              <option value="contractor">顧問</option>
            </select>
          </div>

          <div className="ml-auto text-sm text-slate-500 dark:text-slate-400 self-end pb-0.5">
            共 <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">{totalCount}</span> 筆
          </div>
        </div>
      </div>

      {/* Records Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-700 dark:bg-slate-900">
                <th className="text-left px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('employee')}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('date')}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('clockInLabel')}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('clockOutLabel')}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('autoClocked')}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-100 whitespace-nowrap">備註</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center justify-center py-14 text-center">
                      <Clock size={40} className="text-slate-200 dark:text-slate-600 mb-3" aria-hidden="true" />
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{t('noRecords')}</p>
                      <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                        請確認篩選條件或選擇其他月份
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paged.map(r => {
                  const clockIn = formatTime(r.clock_in)
                  const clockOut = formatTime(r.clock_out)
                  const missingIn = !r.clock_in
                  const missingOut = !r.clock_out
                  const isAuto = r.is_auto_in || r.is_auto_out

                  return (
                    <tr
                      key={r.id}
                      className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      {/* 員工 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {r.user?.display_name ?? '—'}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {r.user?.department?.name ?? ''}
                          {r.user?.employment_type && (
                            <span className="ml-1">
                              · {employmentTypeLabel[r.user.employment_type] ?? r.user.employment_type}
                            </span>
                          )}
                        </p>
                      </td>

                      {/* 日期 */}
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400 tabular-nums">
                        {r.clock_date}
                      </td>

                      {/* 上班時間 */}
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {missingIn ? (
                          <span className="text-red-600 dark:text-red-400 font-medium" role="status">
                            缺打
                          </span>
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">
                            {clockIn}
                            {r.is_auto_in && (
                              <AutoBadge />
                            )}
                          </span>
                        )}
                      </td>

                      {/* 下班時間 */}
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {missingOut ? (
                          <span className="text-red-600 dark:text-red-400 font-medium" role="status">
                            缺打
                          </span>
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">
                            {clockOut}
                            {r.is_auto_out && (
                              <AutoBadge />
                            )}
                          </span>
                        )}
                      </td>

                      {/* 是否自動 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isAuto ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700"
                            role="status"
                          >
                            <Bot size={10} aria-hidden="true" />
                            系統自動
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600 text-xs">手動</span>
                        )}
                      </td>

                      {/* 備註 */}
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                        {r.notes || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
              第 <span className="font-semibold text-slate-700 dark:text-slate-300">{page}</span> 頁&ensp;
              共 <span className="font-semibold text-slate-700 dark:text-slate-300">{totalCount}</span> 筆
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="上一頁"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-green-600"
              >
                <ChevronLeft size={14} aria-hidden="true" />
                上一頁
              </button>
              <span className="text-xs text-slate-400 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="下一頁"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-green-600"
              >
                下一頁
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AutoBadge() {
  return (
    <span
      className="ml-1.5 inline-flex items-center text-[10px] font-medium px-1.5 py-0 rounded border bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700 align-middle"
      aria-label="系統自動"
    >
      自動
    </span>
  )
}
