'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { format, addDays, parseISO } from 'date-fns'
import { taipeiToday } from '@/lib/taipei-date'
import { CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Props {
  groups: { id: string; name: string }[]
}

interface MemberData {
  user_id: string
  id: string
  display_name: string | null
  email: string
}

interface TeamData {
  members: MemberData[]
  schedules: { user_id: string; items: { label: string; note: string }[] }[]
  completions: { user_id: string; items: { label: string; note: string; done: boolean }[] }[]
  kpiEntries: { user_id: string; kpi_def_id: string; value: number }[]
  kpiDefs: { user_id: string; kpi_id: string; name: string; unit: string; target: number; cat: string }[]
}

export function TeamViewClient({ groups }: Props) {
  const t = useTranslations('dailyReport')
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '')
  const [date, setDate] = useState(() => taipeiToday())
  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/daily-report/team?date=${date}&groupId=${groupId}`)
      const json = await res.json()
      setData(json.data ?? null)
    } finally {
      setLoading(false)
    }
  }, [date, groupId])

  useEffect(() => { load() }, [load])

  const shiftDate = (days: number) => {
    // parseISO 將 'YYYY-MM-DD' 解析為「本地」午夜（非 UTC），addDays 做日曆日加減，
    // format 亦以本地欄位輸出 — 全程不經 UTC 換算，任何瀏覽器時區都得到正確日期。
    setDate(format(addDays(parseISO(date), days), 'yyyy-MM-dd'))
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {groups.length > 1 && (
          <select
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <Button variant="ghost" size="icon" onClick={() => shiftDate(-1)}>
          <ChevronLeft size={18} />
        </Button>
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-slate-400" />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={() => shiftDate(1)}>
          <ChevronRight size={18} />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDate(taipeiToday())}>
          {t('today')}
        </Button>
      </div>

      {loading && <p className="text-sm text-slate-400">{t('loading')}</p>}

      {!loading && data && data.members.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">{t('noMembers')}</p>
      )}

      {!loading && data && data.members.map(member => {
        const schedule = data.schedules.find(s => s.user_id === member.user_id)
        const completion = data.completions.find(c => c.user_id === member.user_id)
        const memberKpiDefs = data.kpiDefs.filter(d => d.user_id === member.user_id)
        const memberKpiEntries = data.kpiEntries.filter(e => e.user_id === member.user_id)

        const completionCount = completion?.items.filter(i => i.done).length ?? 0
        const completionTotal = completion?.items.length ?? 0

        return (
          <Card key={member.user_id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{member.display_name ?? member.email}</span>
                {completionTotal > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {completionCount}/{completionTotal} {t('completed')}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Schedule */}
              {schedule && schedule.items.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">{t('tabSchedule')}</p>
                  <div className="space-y-1">
                    {schedule.items.map((item, i) => (
                      <div key={i} className="flex gap-2 text-sm">
                        <span className="text-slate-700 dark:text-slate-300 font-medium min-w-0 truncate">{item.label}</span>
                        {item.note && <span className="text-slate-400 min-w-0 truncate">— {item.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completion */}
              {completion && completion.items.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">{t('tabCompletion')}</p>
                  <div className="space-y-1">
                    {completion.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {item.done
                          ? <CheckCircle2 size={14} className="text-green-600 dark:text-green-400 shrink-0" />
                          : <Circle size={14} className="text-slate-300 dark:text-slate-600 shrink-0" />
                        }
                        <span className={`min-w-0 truncate ${item.done ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {item.label}
                        </span>
                        {item.note && <span className="text-slate-400 truncate">— {item.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* KPI */}
              {memberKpiDefs.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">{t('tabKpi')}</p>
                  <div className="flex flex-wrap gap-3">
                    {memberKpiDefs.map(def => {
                      const entry = memberKpiEntries.find(e => e.kpi_def_id === def.kpi_id)
                      return (
                        <div key={def.kpi_id} className="text-sm">
                          <span className="text-slate-500 dark:text-slate-400">{def.name}：</span>
                          <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                            {entry?.value ?? '—'} {def.unit}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!schedule?.items.length && !completion?.items.length && memberKpiDefs.length === 0 && (
                <p className="text-sm text-slate-400">{t('noReport')}</p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
