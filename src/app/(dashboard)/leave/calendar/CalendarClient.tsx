'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  parseISO,
  isWithinInterval,
  addMonths,
  subMonths,
  getDay,
  startOfWeek,
  endOfWeek,
  isSameMonth,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays, Filter } from 'lucide-react'
import { StatusBadge } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaveRecord {
  id: string
  user_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  status: 'approved' | 'pending'
  reason: string
  display_name: string
  department_id: string
  leave_type_name: string
}

interface Department {
  id: string
  name: string
}

interface CurrentUser {
  id: string
  role: string
  department_id: string
  display_name: string
  isHR?: boolean
}

interface Props {
  initialLeaves: LeaveRecord[]
  currentUser: CurrentUser
  departments: Department[]
  isAdmin: boolean
  initialYear?: number
  initialMonth?: number
}

// ─── Week header labels ───────────────────────────────────────────────────────

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

// ─── Status dot colour ────────────────────────────────────────────────────────

function statusDotClass(status: string) {
  if (status === 'approved') return 'bg-green-500'
  if (status === 'pending') return 'bg-yellow-400'
  return 'bg-slate-400'
}

// ─── Duration helper ──────────────────────────────────────────────────────────

function leaveDuration(start: string, end: string): string {
  const s = parseISO(start)
  const e = parseISO(end)
  const days =
    Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return days === 1 ? '1 天' : `${days} 天`
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CalendarClient({
  initialLeaves,
  currentUser,
  departments,
  isAdmin,
  initialYear,
  initialMonth,
}: Props) {
  const [currentMonth, setCurrentMonth] = useState<Date>(
    initialYear !== undefined && initialMonth !== undefined
      ? new Date(initialYear, initialMonth, 1)
      : new Date()
  )
  const [leaves, setLeaves] = useState<LeaveRecord[]>(initialLeaves)
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all')
  const [myDeptOnly, setMyDeptOnly] = useState<boolean>(false)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [loadingMonth, setLoadingMonth] = useState(false)

  const listSectionRef = useRef<HTMLDivElement>(null)

  // Fetch leaves when month changes
  const fetchMonth = useCallback(async (date: Date) => {
    setLoadingMonth(true)
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const lastDay = new Date(y, m, 0).getDate()
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    try {
      const res = await fetch(`/api/leave/requests?start=${start}&end=${end}&calendar=1`)
      if (res.ok) {
        const json = await res.json()
        setLeaves(json.data ?? [])
      }
    } catch { /* keep old data */ }
    setLoadingMonth(false)
  }, [])

  const handleMonthChange = useCallback((date: Date) => {
    setCurrentMonth(date)
    setSelectedDay(null)
    fetchMonth(date)
  }, [fetchMonth])

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filteredLeaves = useMemo<LeaveRecord[]>(() => {
    let filtered = leaves

    if (isAdmin && selectedDeptId !== 'all') {
      filtered = filtered.filter((l) => l.department_id === selectedDeptId)
    }

    if (myDeptOnly) {
      filtered = filtered.filter(
        (l) => l.department_id === currentUser.department_id
      )
    }

    return filtered
  }, [leaves, selectedDeptId, myDeptOnly, isAdmin, currentUser.department_id])

  // ── Month navigation ───────────────────────────────────────────────────────

  const prevMonth = useCallback(() => {
    const d = subMonths(currentMonth, 1)
    handleMonthChange(d)
  }, [currentMonth, handleMonthChange])

  const nextMonth = useCallback(() => {
    const d = addMonths(currentMonth, 1)
    handleMonthChange(d)
  }, [currentMonth, handleMonthChange])

  // ── Calendar grid computation ──────────────────────────────────────────────

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [currentMonth])

  // ── Leaves that fall within the visible month ──────────────────────────────

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)

  const leavesInMonth = useMemo<LeaveRecord[]>(() => {
    return filteredLeaves.filter((l) => {
      const s = parseISO(l.start_date)
      const e = parseISO(l.end_date)
      return s <= monthEnd && e >= monthStart
    })
  }, [filteredLeaves, monthStart, monthEnd])

  // ── Leaves on a specific day ───────────────────────────────────────────────

  function leavesOnDay(day: Date): LeaveRecord[] {
    return leavesInMonth.filter((l) => {
      const s = parseISO(l.start_date)
      const e = parseISO(l.end_date)
      return isWithinInterval(day, { start: s, end: e })
    })
  }

  // ── Click a day → scroll to list section ──────────────────────────────────

  function handleDayClick(day: Date) {
    setSelectedDay(day)
    setTimeout(() => {
      listSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  // ── Days with leave entries grouped for list section ──────────────────────

  const daysWithLeaves = useMemo<{ day: Date; leaves: LeaveRecord[] }[]>(() => {
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
    return allDays
      .map((day) => ({ day, leaves: leavesOnDay(day) }))
      .filter((entry) => entry.leaves.length > 0)
  }, [leavesInMonth, monthStart, monthEnd])

  const focusedEntries = useMemo(() => {
    if (!selectedDay) return daysWithLeaves
    return daysWithLeaves.filter((entry) => isSameDay(entry.day, selectedDay))
  }, [selectedDay, daysWithLeaves])

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />

        {isAdmin && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="dept-filter"
              className="text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
            >
              部門
            </label>
            <select
              id="dept-filter"
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className={cn(
                'min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700',
                'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100',
                'px-3 py-2 text-sm cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600',
                'transition-colors duration-150'
              )}
            >
              <option value="all">全部部門</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={myDeptOnly}
            onChange={(e) => setMyDeptOnly(e.target.checked)}
            className={cn(
              'w-4 h-4 rounded border-slate-300 cursor-pointer',
              'accent-violet-600',
              'focus-visible:ring-2 focus-visible:ring-violet-600'
            )}
            aria-label="只顯示我的部門"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300 select-none">
            只顯示我的部門
          </span>
        </label>

        {selectedDay && (
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className={cn(
              'min-h-[44px] px-3 py-2 rounded-lg text-sm cursor-pointer',
              'border border-slate-200 dark:border-slate-700',
              'text-slate-600 dark:text-slate-400',
              'hover:bg-slate-50 dark:hover:bg-slate-800',
              'transition-colors duration-150',
              'focus-visible:ring-2 focus-visible:ring-violet-600'
            )}
          >
            清除日期篩選
          </button>
        )}
      </div>

      {/* ── Calendar Card ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        {/* Month navigation header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="上個月"
            className={cn(
              'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg cursor-pointer',
              'text-slate-500 dark:text-slate-400',
              'hover:bg-slate-100 dark:hover:bg-slate-700',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600'
            )}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-[Lexend]">
            {format(currentMonth, 'yyyy 年 M 月')}
          </h2>

          <button
            type="button"
            onClick={nextMonth}
            aria-label="下個月"
            className={cn(
              'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg cursor-pointer',
              'text-slate-500 dark:text-slate-400',
              'hover:bg-slate-100 dark:hover:bg-slate-700',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600'
            )}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Week day headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
          {WEEK_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn(
                'py-2 text-center text-xs font-medium select-none',
                i === 0 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Day cells grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false
            const isToday = isSameDay(day, new Date())
            const dayLeaves = leavesOnDay(day)
            const hasLeaves = dayLeaves.length > 0
            const approvedCount = dayLeaves.filter((l) => l.status === 'approved').length
            const pendingCount = dayLeaves.filter((l) => l.status === 'pending').length

            return (
              <button
                key={idx}
                type="button"
                onClick={() => isCurrentMonth && hasLeaves && handleDayClick(day)}
                aria-label={`${format(day, 'yyyy-MM-dd')}${hasLeaves ? `，${dayLeaves.length} 人請假` : ''}`}
                className={cn(
                  'relative min-h-[64px] p-1.5 border-b border-r border-slate-100 dark:border-slate-700/50',
                  'flex flex-col items-start gap-1',
                  'transition-colors duration-150',
                  isCurrentMonth && hasLeaves
                    ? 'cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/10'
                    : 'cursor-default',
                  isSelected && 'bg-violet-50 dark:bg-violet-900/20',
                  !isCurrentMonth && 'opacity-30'
                )}
              >
                {/* Day number */}
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium',
                    isToday && isCurrentMonth
                      ? 'bg-violet-600 text-white'
                      : isSelected
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                      : getDay(day) === 0
                      ? 'text-red-500'
                      : 'text-slate-700 dark:text-slate-300'
                  )}
                >
                  {format(day, 'd')}
                </span>

                {/* Leave dots */}
                {isCurrentMonth && (
                  <div className="flex flex-wrap gap-0.5 mt-auto">
                    {approvedCount > 0 && (
                      <span
                        className="flex items-center gap-0.5"
                        aria-hidden="true"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                        {approvedCount > 1 && (
                          <span className="text-[10px] text-green-700 dark:text-green-400 font-medium leading-none">
                            {approvedCount}
                          </span>
                        )}
                      </span>
                    )}
                    {pendingCount > 0 && (
                      <span
                        className="flex items-center gap-0.5"
                        aria-hidden="true"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                        {pendingCount > 1 && (
                          <span className="text-[10px] text-yellow-700 dark:text-yellow-400 font-medium leading-none">
                            {pendingCount}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          <span className="text-xs text-slate-500 dark:text-slate-400">圖例：</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" aria-hidden="true" />
            已核准
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" aria-hidden="true" />
            待審核
          </span>
        </div>
      </div>

      {/* ── Leave List Section ── */}
      <div ref={listSectionRef} className="scroll-mt-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="w-5 h-5 text-violet-600" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-[Lexend]">
            {selectedDay
              ? `${format(selectedDay, 'M 月 d 日')} 請假名單`
              : `${format(currentMonth, 'M 月')} 請假名單`}
          </h3>
          {selectedDay && (
            <span className="text-sm text-slate-400 dark:text-slate-500">
              （點擊日曆格可篩選）
            </span>
          )}
        </div>

        {focusedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <CalendarDays className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {selectedDay
                ? '此日沒有請假記錄'
                : '本月目前沒有請假記錄'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              僅顯示已核准或待審核的請假申請
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {focusedEntries.map(({ day, leaves }) => (
              <div
                key={day.toISOString()}
                id={`day-${format(day, 'yyyy-MM-dd')}`}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm"
              >
                {/* Date group header */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                    {format(day, 'M 月 d 日')}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    （{WEEK_LABELS[getDay(day)]}）
                  </span>
                  <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                    {leaves.length} 人請假
                  </span>
                </div>

                {/* Table wrapper with overflow-x-auto */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px]">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700">
                        <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">
                          姓名
                        </th>
                        <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">
                          假別
                        </th>
                        <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">
                          期間
                        </th>
                        <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">
                          天數
                        </th>
                        <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 px-4 py-2.5">
                          狀態
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaves.map((leave) => (
                        <tr
                          key={leave.id}
                          className="border-b border-slate-100 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors duration-150"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'w-2 h-2 rounded-full shrink-0',
                                  statusDotClass(leave.status)
                                )}
                                aria-hidden="true"
                              />
                              {leave.display_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                            {leave.leave_type_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {leave.start_date === leave.end_date
                              ? leave.start_date
                              : `${leave.start_date} ～ ${leave.end_date}`}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {leaveDuration(leave.start_date, leave.end_date)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={leave.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
