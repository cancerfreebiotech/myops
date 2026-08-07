'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { format, addDays, parseISO } from 'date-fns'
import { taipeiToday } from '@/lib/taipei-date'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, CheckCircle2, Circle, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { DrScheduleItem, DrKpiDefinition, DrKpiEntry, DrSchItem } from '@/lib/daily-report/types'

interface Props {
  userId: string
  isViewer: boolean
}

// 「完成回報」分頁已於 feedback 00dbbd55 移除：今日行程的完成勾選（done）
// 就是完成回報，主管的團隊檢視直接讀 daily_schedules.items[].done。
type Tab = 'schedule' | 'kpi'

// 行程項目穩定識別碼（列 key 與跨儲存識別用）
const newSid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

// 舊資料可能缺 sid / done，載入時補齊
const normalizeScheduleItems = (items: DrScheduleItem[]): DrScheduleItem[] =>
  items.map(item => ({ ...item, sid: item.sid || newSid(), done: item.done === true }))

export function DailyReportClient({ userId }: Props) {
  const t = useTranslations('dailyReport')
  const [tab, setTab] = useState<Tab>('schedule')
  const [date, setDate] = useState(() => taipeiToday())
  const [saving, setSaving] = useState(false)

  // Schedule state
  const [scheduleItems, setScheduleItems] = useState<DrScheduleItem[]>([])
  const [schTemplates, setSchTemplates] = useState<DrSchItem[]>([])

  // KPI state
  const [kpiDefs, setKpiDefs] = useState<DrKpiDefinition[]>([])
  const [kpiEntries, setKpiEntries] = useState<DrKpiEntry[]>([])

  useEffect(() => {
    // cancelled 防止快速切換日期時，較慢的舊回應覆蓋新日期的資料
    let cancelled = false
    const loadAll = async () => {
      try {
        const okJson = (r: Response) => {
          if (!r.ok) throw new Error(String(r.status))
          return r.json()
        }
        const [sch, kpi, entries, schT] = await Promise.all([
          fetch(`/api/daily-report/schedule?date=${date}`).then(okJson),
          fetch(`/api/daily-report/kpi?date=${date}`).then(okJson),
          fetch(`/api/daily-report/kpi-definitions?userId=${userId}`).then(okJson),
          fetch(`/api/daily-report/sch-items`).then(okJson),
        ])
        if (cancelled) return
        setScheduleItems(normalizeScheduleItems(sch.data?.items ?? []))
        setKpiEntries(kpi.data ?? [])
        setKpiDrafts({})
        setKpiDefs(entries.data ?? [])
        setSchTemplates(schT.data ?? [])
      } catch {
        if (!cancelled) toast.error(t('loadFailed'))
      }
    }
    loadAll()
    const timers = kpiTimers.current
    const pending = kpiPending.current
    return () => {
      cancelled = true
      // 切日前先取消 debounce 計時器，再把「尚未送出」的 KPI 值 flush 到其輸入當下的日期。
      // 每個 flush 都帶著輸入時捕捉的舊日期送存，故不會污染新日期畫面，也不會靜默丟棄未存值。
      Object.values(timers).forEach(clearTimeout)
      Object.values(pending).forEach((flush) => flush())
      kpiPending.current = {}
    }
  }, [date, userId, t])

  const shiftDate = (days: number) => {
    // parseISO 將 'YYYY-MM-DD' 解析為「本地」午夜（非 UTC），addDays 做日曆日加減，
    // format 亦以本地欄位輸出 — 全程不經 UTC 換算，任何瀏覽器時區都得到正確日期。
    setDate(format(addDays(parseISO(date), days), 'yyyy-MM-dd'))
  }

  // ── Schedule ─────────────────────────────────────────────────
  const addScheduleItem = (label = '', note = '') =>
    setScheduleItems(prev => [...prev, { label, note, sid: newSid(), done: false }])

  const updateScheduleItem = (idx: number, field: 'label' | 'note', val: string) =>
    setScheduleItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item))

  const toggleScheduleDone = (idx: number) =>
    setScheduleItems(prev => prev.map((item, i) => i === idx ? { ...item, done: !item.done } : item))

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
      const json = await res.json()
      if (json.data?.items) setScheduleItems(normalizeScheduleItems(json.data.items))
      toast.success(t('saved'))
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  // ── KPI ──────────────────────────────────────────────────────
  const getKpiValue = (defId: string) =>
    kpiEntries.find(e => e.kpi_def_id === defId && e.date === date)?.value ?? ''

  // 每個 KPI 各自 debounce，避免每個按鍵都打一次 API（舊值可能晚到蓋掉新值）
  const kpiTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // 尚未送出（debounce 中）的 flush 函式，keyed by defId；切日時據此把未存值送存到其原本日期
  const kpiPending = useRef<Record<string, () => void>>({})
  // 輸入中的原始字串（允許清空欄位而不誤存 0）
  const [kpiDrafts, setKpiDrafts] = useState<Record<string, string>>({})

  // 以「輸入當下捕捉的日期 d」送存，故切日 flush 時仍寫回正確日期。
  const saveKpi = async (d: string, defId: string, value: number) => {
    try {
      const res = await fetch('/api/daily-report/kpi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: d, kpi_def_id: defId, value }),
      })
      if (!res.ok) throw new Error()
      setKpiEntries(prev => {
        const existing = prev.findIndex(e => e.kpi_def_id === defId && e.date === d)
        if (existing >= 0) return prev.map((e, i) => i === existing ? { ...e, value } : e)
        return [...prev, { id: '', user_id: userId, date: d, kpi_def_id: defId, value }]
      })
    } catch {
      toast.error(t('saveFailed'))
    }
  }

  const setKpiValue = (defId: string, raw: string) => {
    setKpiDrafts(prev => ({ ...prev, [defId]: raw }))
    clearTimeout(kpiTimers.current[defId])
    if (raw === '') { delete kpiPending.current[defId]; return }
    const value = Number(raw)
    if (Number.isNaN(value)) return
    const d = date
    // flush：清掉自己的 pending/timer 註記後送存。debounce 到時或切日時皆走同一條路徑。
    const flush = () => {
      delete kpiPending.current[defId]
      delete kpiTimers.current[defId]
      saveKpi(d, defId, value)
    }
    kpiPending.current[defId] = flush
    kpiTimers.current[defId] = setTimeout(flush, 600)
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'schedule', label: t('tabSchedule'), icon: CalendarDays },
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
        <Button variant="outline" size="sm" onClick={() => setDate(taipeiToday())}>
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
                    const fromTemplate = schTemplates.map(s => ({ label: s.label, note: '', sid: newSid(), done: false }))
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
              <div key={item.sid ?? idx} className="flex gap-2 items-center">
                <button
                  onClick={() => toggleScheduleDone(idx)}
                  aria-label={t(item.done ? 'markItemUndone' : 'markItemDone')}
                  className="shrink-0 cursor-pointer text-slate-400 hover:text-green-600 dark:hover:text-green-400 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  {item.done
                    ? <CheckCircle2 size={20} className="text-green-600 dark:text-green-400" />
                    : <Circle size={20} />
                  }
                </button>
                <Input
                  value={item.label}
                  onChange={e => updateScheduleItem(idx, 'label', e.target.value)}
                  placeholder={t('scheduleLabelPlaceholder')}
                  className={`flex-1 ${item.done ? 'line-through text-slate-400' : ''}`}
                />
                <Input
                  value={item.note}
                  onChange={e => updateScheduleItem(idx, 'note', e.target.value)}
                  placeholder={t('scheduleNotePlaceholder')}
                  className="flex-1"
                />
                <Button variant="ghost" size="icon" aria-label={t('removeItem')} onClick={() => removeScheduleItem(idx)} className="text-slate-400 hover:text-red-500 shrink-0">
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            <p className="text-xs text-slate-400 dark:text-slate-500 pt-1">{t('scheduleSyncHint')}</p>
            <div className="pt-2">
              <Button onClick={saveSchedule} disabled={saving}>
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
                      <Badge variant="outline" className="text-xs">
                        {def.cat === '量化' ? t('catQuant') : def.cat === '質化' ? t('catQual') : def.cat}
                      </Badge>
                      <span className="text-xs text-slate-400">{t('target')}: {def.target} {def.unit}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="number"
                      value={kpiDrafts[def.kpi_id] ?? getKpiValue(def.kpi_id)}
                      onChange={e => setKpiValue(def.kpi_id, e.target.value)}
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
