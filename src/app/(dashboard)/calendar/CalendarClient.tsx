'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { addMonths, format, getDay, getDaysInMonth, startOfMonth } from 'date-fns'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { taipeiToday } from '@/lib/taipei-date'

type RsvpStatus = 'attending' | 'declined' | 'maybe'

interface EventRsvp {
  counts: { attending: number; declined: number; maybe: number }
  my_status: RsvpStatus | null
  attendees: { status: RsvpStatus; display_name: string | null }[]
}

interface CompanyEvent {
  id: string
  title: string
  description: string | null
  start_date: string
  end_date: string | null
  rsvp?: EventRsvp | null
}

interface LeaveItem {
  id: string
  start_date: string
  end_date: string
  user: { display_name: string | null } | null
  leave_type: { name: string } | null
}

interface TripItem {
  id: string
  destination: string
  start_date: string
  end_date: string
  user: { display_name: string | null } | null
}

interface OverviewData {
  events: CompanyEvent[]
  leaves: LeaveItem[]
  trips: TripItem[]
}

type ItemType = 'event' | 'leave' | 'trip'

interface DayItem {
  key: string
  type: ItemType
  label: string
  start: string
  end: string
  event?: CompanyEvent
}

const EMPTY_DATA: OverviewData = { events: [], leaves: [], trips: [] }

const WEEKDAY_KEYS = ['wd0', 'wd1', 'wd2', 'wd3', 'wd4', 'wd5', 'wd6'] as const

const TYPE_KEYS: Record<ItemType, string> = {
  event: 'typeEvent',
  leave: 'typeLeave',
  trip: 'typeTrip',
}

const CHIP_STYLES: Record<ItemType, string> = {
  leave: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  trip: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  event: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
}

const DOT_STYLES: Record<ItemType, string> = {
  leave: 'bg-blue-500',
  trip: 'bg-purple-500',
  event: 'bg-green-500',
}

// RSVP 選項（語意狀態色：參加=approved 綠、不參加=rejected 紅、未定=pending 黃）
const RSVP_OPTIONS: { value: RsvpStatus; labelKey: 'rsvpAttending' | 'rsvpDeclined' | 'rsvpMaybe'; selectedClass: string }[] = [
  {
    value: 'attending',
    labelKey: 'rsvpAttending',
    selectedClass: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300',
  },
  {
    value: 'declined',
    labelKey: 'rsvpDeclined',
    selectedClass: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  },
  {
    value: 'maybe',
    labelKey: 'rsvpMaybe',
    selectedClass: 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300',
  },
]

export function CalendarClient({ isManager }: { isManager: boolean }) {
  const t = useTranslations('calendarPage')
  const today = taipeiToday()

  const [month, setMonth] = useState(() => taipeiToday().slice(0, 7))
  const [data, setData] = useState<OverviewData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => taipeiToday())

  // 新增活動表單
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // RSVP：儲存中的活動 id、展開名單的活動 id
  const [rsvpSaving, setRsvpSaving] = useState<string | null>(null)
  const [expandedRsvpId, setExpandedRsvpId] = useState<string | null>(null)

  // 編輯活動（inline）
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/calendar/overview?month=${month}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setData(json.data ?? EMPTY_DATA)
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [month, t])

  useEffect(() => {
    const load = async () => { await loadOverview() }
    load()
  }, [loadOverview])

  const allItems = useMemo<DayItem[]>(() => {
    const items: DayItem[] = []
    for (const ev of data.events) {
      items.push({
        key: `event-${ev.id}`,
        type: 'event',
        label: ev.title,
        start: ev.start_date.slice(0, 10),
        end: (ev.end_date ?? ev.start_date).slice(0, 10),
        event: ev,
      })
    }
    for (const lv of data.leaves) {
      items.push({
        key: `leave-${lv.id}`,
        type: 'leave',
        label: `${lv.user?.display_name ?? ''} ${lv.leave_type?.name ?? ''}`.trim(),
        start: lv.start_date.slice(0, 10),
        end: lv.end_date.slice(0, 10),
      })
    }
    for (const tp of data.trips) {
      items.push({
        key: `trip-${tp.id}`,
        type: 'trip',
        label: `${tp.user?.display_name ?? ''} ${tp.destination}`.trim(),
        start: tp.start_date.slice(0, 10),
        end: tp.end_date.slice(0, 10),
      })
    }
    return items
  }, [data])

  const itemsOn = useCallback(
    (date: string) => allItems.filter(item => item.start <= date && date <= item.end),
    [allItems],
  )

  // 月曆 grid 計算（週日開始）
  const [year, monthNum] = month.split('-').map(Number)
  const monthDate = new Date(year, monthNum - 1, 1)
  const leadingBlanks = getDay(startOfMonth(monthDate))
  const daysInMonth = getDaysInMonth(monthDate)
  const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7
  const cells: (string | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const day = i - leadingBlanks + 1
    return day >= 1 && day <= daysInMonth ? `${month}-${String(day).padStart(2, '0')}` : null
  })

  const shiftMonth = (delta: number) => {
    setMonth(format(addMonths(monthDate, delta), 'yyyy-MM'))
  }

  const goToday = () => {
    setMonth(today.slice(0, 7))
    setSelectedDate(today)
  }

  const toggleAddForm = () => {
    if (!showAddForm) setNewStartDate(selectedDate || today)
    setShowAddForm(!showAddForm)
  }

  const submitNewEvent = async () => {
    if (!newTitle.trim() || !newStartDate || (newEndDate !== '' && newEndDate < newStartDate)) {
      toast.error(t('requiredFields'))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          start_date: newStartDate,
          end_date: newEndDate || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('eventAdded'))
      setNewTitle('')
      setNewDescription('')
      setNewEndDate('')
      setShowAddForm(false)
      await loadOverview()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleEdit = (ev: CompanyEvent) => {
    if (editingId === ev.id) {
      setEditingId(null)
      return
    }
    setEditingId(ev.id)
    setEditTitle(ev.title)
    setEditDescription(ev.description ?? '')
    setEditStartDate(ev.start_date.slice(0, 10))
    setEditEndDate((ev.end_date ?? ev.start_date).slice(0, 10))
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (!editTitle.trim() || !editStartDate || (editEndDate !== '' && editEndDate < editStartDate)) {
      toast.error(t('requiredFields'))
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/calendar/events/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          start_date: editStartDate,
          end_date: editEndDate || editStartDate,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('eventSaved'))
      setEditingId(null)
      await loadOverview()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const submitRsvp = async (eventId: string, status: RsvpStatus) => {
    setRsvpSaving(eventId)
    try {
      const res = await fetch(`/api/calendar/events/${eventId}/rsvp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('rsvpSaved'))
      await loadOverview()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setRsvpSaving(null)
    }
  }

  const deleteEvent = async (id: string) => {
    if (!confirm(t('deleteConfirm'))) return
    try {
      const res = await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(t('eventDeleted'))
      if (editingId === id) setEditingId(null)
      await loadOverview()
    } catch {
      toast.error(t('saveFailed'))
    }
  }

  const dayItems = itemsOn(selectedDate)

  return (
    <div className="space-y-4 pb-8">
      {/* 工具列：月份切換 + 今天 + 新增活動 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="cursor-pointer">
            <ChevronLeft size={20} />
          </Button>
          <span className="text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums min-w-24 text-center">
            {year}年{monthNum}月
          </span>
          <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => shiftMonth(1)} className="cursor-pointer">
            <ChevronRight size={20} />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday} className="ml-1 cursor-pointer">
            {t('today')}
          </Button>
        </div>
        {isManager && (
          <Button size="sm" onClick={toggleAddForm} className="cursor-pointer">
            <Plus size={14} className="mr-1" />{t('addEvent')}
          </Button>
        )}
      </div>

      {/* 新增活動表單 */}
      {isManager && showAddForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="new-event-title" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  {t('eventTitle')} <span className="text-red-500">*</span>
                </label>
                <Input
                  id="new-event-title"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="new-event-description" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  {t('eventDescription')}
                </label>
                <Input
                  id="new-event-description"
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="new-event-start" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  {t('startDate')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="new-event-start"
                  type="date"
                  value={newStartDate}
                  onChange={e => setNewStartDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="new-event-end" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  {t('endDate')}
                </label>
                <input
                  id="new-event-end"
                  type="date"
                  value={newEndDate}
                  onChange={e => setNewEndDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <Button onClick={submitNewEvent} disabled={submitting} className="cursor-pointer">
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 月曆 grid（週日開始） */}
      <div className={`transition-opacity ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {WEEKDAY_KEYS.map(k => (
            <div key={k} className="bg-slate-50 dark:bg-slate-900 py-1.5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
              {t(k)}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) {
              return <div key={`blank-${i}`} className="min-h-16 md:min-h-24 bg-slate-50 dark:bg-slate-900" />
            }
            const items = itemsOn(date)
            const isToday = date === today
            const isSelected = date === selectedDate
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={`relative min-h-16 md:min-h-24 p-1 text-left cursor-pointer transition-colors border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:z-10 ${
                  isToday ? 'border-blue-500' : 'border-transparent'
                } ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-slate-700'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <span className={`block text-xs font-medium tabular-nums ${
                  isToday ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'
                }`}>
                  {Number(date.slice(8, 10))}
                </span>
                {/* 手機：色點 + 數量 */}
                {items.length > 0 && (
                  <span className="md:hidden mt-1 flex items-center gap-0.5">
                    {items.slice(0, 3).map(item => (
                      <span key={item.key} className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[item.type]}`} />
                    ))}
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-0.5 tabular-nums">
                      {items.length}
                    </span>
                  </span>
                )}
                {/* md 以上：文字 chips（最多 3 個） */}
                <span className="hidden md:block mt-1 space-y-0.5">
                  {items.slice(0, 3).map(item => (
                    <span
                      key={item.key}
                      className={`block w-full truncate rounded px-1 py-px text-[11px] leading-4 ${CHIP_STYLES[item.type]}`}
                    >
                      {item.label}
                    </span>
                  ))}
                  {items.length > 3 && (
                    <span className="block px-1 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                      +{items.length - 3}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 當日行程 */}
      <Card>
        <CardContent className="pt-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('dayDetail')} · <span className="tabular-nums">{selectedDate}</span>
          </h2>
          {dayItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">{t('noItems')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dayItems.map(item => {
                const ev = item.event
                return (
                <li key={item.key} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-xs border-transparent ${CHIP_STYLES[item.type]}`}>
                          {t(TYPE_KEYS[item.type])}
                        </Badge>
                        <span className="text-sm text-slate-800 dark:text-slate-200 break-words">
                          {item.label}
                        </span>
                      </div>
                      {ev?.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 break-words">
                          {ev.description}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-1 tabular-nums">
                        {item.start}{item.end !== item.start ? ` ~ ${item.end}` : ''}
                      </p>
                    </div>
                    {isManager && ev && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('editEvent')}
                          onClick={() => toggleEdit(ev)}
                          className="h-8 w-8 text-slate-400 hover:text-blue-600 cursor-pointer"
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('deleteEvent')}
                          onClick={() => deleteEvent(ev.id)}
                          className="h-8 w-8 text-slate-400 hover:text-red-500 cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* RSVP：參加/不參加/未定 + 出席統計與名單 */}
                  {ev && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={t('rsvpTitle')}>
                          {RSVP_OPTIONS.map(opt => {
                            const selected = ev.rsvp?.my_status === opt.value
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                disabled={rsvpSaving === ev.id}
                                aria-pressed={selected}
                                onClick={() => submitRsvp(ev.id, opt.value)}
                                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed ${
                                  selected
                                    ? opt.selectedClass
                                    : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/50'
                                }`}
                              >
                                {t(opt.labelKey)}
                              </button>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          aria-expanded={expandedRsvpId === ev.id}
                          onClick={() => setExpandedRsvpId(expandedRsvpId === ev.id ? null : ev.id)}
                          className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                        >
                          <Users size={13} />
                          <span className="tabular-nums">
                            {t('rsvpAttendingCount', { count: ev.rsvp?.counts.attending ?? 0 })}
                          </span>
                          {expandedRsvpId === ev.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </div>
                      {expandedRsvpId === ev.id && (
                        (ev.rsvp?.attendees.length ?? 0) === 0 ? (
                          <p className="text-xs text-slate-400">{t('rsvpNobody')}</p>
                        ) : (
                          <dl className="space-y-1">
                            {RSVP_OPTIONS.map(opt => {
                              const names = (ev.rsvp?.attendees ?? [])
                                .filter(a => a.status === opt.value)
                                .map(a => a.display_name || '—')
                              if (names.length === 0) return null
                              return (
                                <div key={opt.value} className="flex gap-2 text-xs">
                                  <dt className="shrink-0 text-slate-500 dark:text-slate-400 tabular-nums">
                                    {t(opt.labelKey)} ({names.length})
                                  </dt>
                                  <dd className="text-slate-700 dark:text-slate-300 break-words">
                                    {names.join(', ')}
                                  </dd>
                                </div>
                              )
                            })}
                          </dl>
                        )
                      )}
                    </div>
                  )}

                  {/* inline 編輯表單 */}
                  {isManager && ev && editingId === ev.id && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor={`edit-title-${ev.id}`} className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                            {t('eventTitle')} <span className="text-red-500">*</span>
                          </label>
                          <Input
                            id={`edit-title-${ev.id}`}
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-description-${ev.id}`} className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                            {t('eventDescription')}
                          </label>
                          <Input
                            id={`edit-description-${ev.id}`}
                            value={editDescription}
                            onChange={e => setEditDescription(e.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-start-${ev.id}`} className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                            {t('startDate')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            id={`edit-start-${ev.id}`}
                            type="date"
                            value={editStartDate}
                            onChange={e => setEditStartDate(e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-end-${ev.id}`} className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                            {t('endDate')}
                          </label>
                          <input
                            id={`edit-end-${ev.id}`}
                            type="date"
                            value={editEndDate}
                            onChange={e => setEditEndDate(e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <Button onClick={saveEdit} disabled={saving} size="sm" className="cursor-pointer">
                        {saving ? t('submitting') : t('submit')}
                      </Button>
                    </div>
                  )}
                </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
