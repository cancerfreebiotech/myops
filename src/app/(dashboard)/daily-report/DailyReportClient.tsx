'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, CheckCircle2, Circle, ClipboardList, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { DrScheduleItem, DrCompletionItem, DrKpiDefinition, DrKpiEntry, DrSchItem, DrWorkItem } from '@/lib/daily-report/types'

interface Props {
  userId: string
  isViewer: boolean
}

type Tab = 'schedule' | 'completion' | 'kpi'

export function DailyReportClient({ userId, isViewer: _isViewer }: Props) {
  const t = useTranslations('dailyReport')
  const [tab, setTab] = useState<Tab>('schedule')
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)

  // Schedule state
  const [scheduleItems, setScheduleItems] = useState<DrScheduleItem[]>([])
  const [schTemplates, setSchTemplates] = useState<DrSchItem[]>([])

  // Completion state
  const [completionItems, setCompletionItems] = useState<DrCompletionItem[]>([])
  const [workTemplates, setWorkTemplates] = useState<DrWorkItem[]>([])

  // KPI state
  const [kpiDefs, setKpiDefs] = useState<DrKpiDefinition[]>([])
  const [kpiEntries, setKpiEntries] = useState<DrKpiEntry[]>([])

  const loadAll = useCallback(async () => {
    const [sch, comp, kpi, entries, schT, workT] = await Promise.all([
      fetch(`/api/daily-report/schedule?date=${date}`).then(r => r.json()),
      fetch(`/api/daily-report/completion?date=${date}`).then(r => r.json()),
      fetch(`/api/daily-report/kpi?date=${date}`).then(r => r.json()),
      fetch(`/api/daily-report/kpi-definitions?userId=${userId}`).then(r => r.json()),
      fetch(`/api/daily-report/sch-items`).then(r => r.json()),
      fetch(`/api/daily-report/work-items`).then(r => r.json()),
    ])
    setScheduleItems(sch.data?.items ?? [])
    setCompletionItems(comp.data?.items ?? [])
    setKpiEntries(kpi.data ?? [])
    setKpiDefs(entries.data ?? [])
    setSchTemplates(schT.data ?? [])
    setWorkTemplates(workT.data ?? [])
  }, [date, userId])

  useEffect(() => { loadAll() }, [loadAll])

  const shiftDate = (days: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    setDate(format(d, 'yyyy-MM-dd'))
  }

  // ── Schedule ─────────────────────────────────────────────────
  const addScheduleItem = (label = '', note = '') =>
    setScheduleItems(prev => [...prev, { label, note }])

  const updateScheduleItem = (idx: number, field: 'label' | 'note', val: string) =>
    setScheduleItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item))

  const removeScheduleItem = (idx: number) =>
    setScheduleItems(prev => prev.filter((_, i) => i !== idx))

  const saveSchedule = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/daily-report/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, items: scheduleItems }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('saved'))
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  // ── Completion ───────────────────────────────────────────────
  const initCompletionFromWork = () => {
    const fromWork = workTemplates.map(w => ({ label: w.label, note: '', done: false }))
    setCompletionItems(fromWork)
  }

  const updateCompletionItem = (idx: number, field: keyof DrCompletionItem, val: string | boolean) =>
    setCompletionItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item))

  const addCompletionItem = () =>
    setCompletionItems(prev => [...prev, { label: '', note: '', done: false }])

  const removeCompletionItem = (idx: number) =>
    setCompletionItems(prev => prev.filter((_, i) => i !== idx))

  const saveCompletion = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/daily-report/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, items: completionItems }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('saved'))
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  // ── KPI ──────────────────────────────────────────────────────
  const getKpiValue = (defId: string) =>
    kpiEntries.find(e => e.kpi_def_id === defId)?.value ?? ''

  const setKpiValue = async (defId: string, value: number) => {
    try {
      await fetch('/api/daily-report/kpi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, kpi_def_id: defId, value }),
      })
      setKpiEntries(prev => {
        const existing = prev.findIndex(e => e.kpi_def_id === defId)
        if (existing >= 0) return prev.map((e, i) => i === existing ? { ...e, value } : e)
        return [...prev, { id: '', user_id: userId, date, kpi_def_id: defId, value }]
      })
    } catch {
      toast.error(t('saveFailed'))
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'schedule', label: t('tabSchedule'), icon: CalendarDays },
    { key: 'completion', label: t('tabCompletion'), icon: ClipboardList },
    { key: 'kpi', label: t('tabKpi'), icon: BarChart3 },
  ]

  return (
    <div className="space-y-4 pb-8">
      {/* Date navigator */}
      <div className="flex items-center gap-3">
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
        <Button variant="outline" size="sm" onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))}>
          {t('today')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Schedule tab ─────────────────────────────────────── */}
      {tab === 'schedule' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              {t('scheduleTitle')}
              <div className="flex gap-2">
                {schTemplates.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => {
                    const fromTemplate = schTemplates.map(s => ({ label: s.label, note: '' }))
                    setScheduleItems(fromTemplate)
                  }}>
                    {t('fromTemplate')}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => addScheduleItem()}>
                  <Plus size={14} className="mr-1" />{t('add')}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {scheduleItems.length === 0 && (
              <p className="text-sm text-slate-400 py-4 text-center">{t('emptySchedule')}</p>
            )}
            {scheduleItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <Input
                  value={item.label}
                  onChange={e => updateScheduleItem(idx, 'label', e.target.value)}
                  placeholder={t('scheduleLabelPlaceholder')}
                  className="flex-1"
                />
                <Input
                  value={item.note}
                  onChange={e => updateScheduleItem(idx, 'note', e.target.value)}
                  placeholder={t('scheduleNotePlaceholder')}
                  className="flex-1"
                />
                <Button variant="ghost" size="icon" onClick={() => removeScheduleItem(idx)} className="text-slate-400 hover:text-red-500 shrink-0">
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            <div className="pt-2">
              <Button onClick={saveSchedule} disabled={saving}>
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Completion tab ───────────────────────────────────── */}
      {tab === 'completion' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              {t('completionTitle')}
              <div className="flex gap-2">
                {workTemplates.length > 0 && (
                  <Button variant="outline" size="sm" onClick={initCompletionFromWork}>
                    {t('fromWorkTemplate')}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={addCompletionItem}>
                  <Plus size={14} className="mr-1" />{t('add')}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {completionItems.length === 0 && (
              <p className="text-sm text-slate-400 py-4 text-center">{t('emptyCompletion')}</p>
            )}
            {completionItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <button
                  onClick={() => updateCompletionItem(idx, 'done', !item.done)}
                  className="shrink-0 text-slate-400 hover:text-green-600 dark:hover:text-green-400 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  {item.done
                    ? <CheckCircle2 size={20} className="text-green-600 dark:text-green-400" />
                    : <Circle size={20} />
                  }
                </button>
                <Input
                  value={item.label}
                  onChange={e => updateCompletionItem(idx, 'label', e.target.value)}
                  placeholder={t('completionLabelPlaceholder')}
                  className={`flex-1 ${item.done ? 'line-through text-slate-400' : ''}`}
                />
                <Input
                  value={item.note}
                  onChange={e => updateCompletionItem(idx, 'note', e.target.value)}
                  placeholder={t('completionNotePlaceholder')}
                  className="flex-1"
                />
                <Button variant="ghost" size="icon" onClick={() => removeCompletionItem(idx)} className="text-slate-400 hover:text-red-500 shrink-0">
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            <div className="pt-2">
              <Button onClick={saveCompletion} disabled={saving}>
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── KPI tab ──────────────────────────────────────────── */}
      {tab === 'kpi' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('kpiTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {kpiDefs.length === 0 && (
              <p className="text-sm text-slate-400 py-4 text-center">{t('noKpiDefs')}</p>
            )}
            <div className="space-y-3">
              {kpiDefs.map(def => (
                <div key={def.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{def.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-xs">{def.cat}</Badge>
                      <span className="text-xs text-slate-400">{t('target')}: {def.target} {def.unit}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="number"
                      value={getKpiValue(def.kpi_id)}
                      onChange={e => setKpiValue(def.kpi_id, parseFloat(e.target.value) || 0)}
                      className="w-24 text-right tabular-nums"
                      placeholder="0"
                    />
                    <span className="text-sm text-slate-400 w-8">{def.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
