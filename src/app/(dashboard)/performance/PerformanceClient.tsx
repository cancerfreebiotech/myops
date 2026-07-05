'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, Check, X, Send, RotateCcw, Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type CycleStatus = 'draft' | 'open' | 'closed'
type ReviewStatus = 'goal_setting' | 'goals_submitted' | 'goals_approved' | 'pending_manager' | 'completed'

interface Cycle {
  id: string
  name: string
  start_date: string
  end_date: string
  status: CycleStatus
}

interface Goal {
  id: string
  review_id: string
  title: string
  description: string | null
  weight: number
  self_rating: number | null
  self_note: string | null
  manager_rating: number | null
  manager_note: string | null
  sort_order: number
}

interface KpiRow {
  kpi_id: string
  name: string
  cat: string
  unit: string
  period: 'monthly' | 'yearly'
  target: number
  actual: number
}

interface Review {
  id: string
  cycle_id: string
  user_id: string
  manager_id: string | null
  status: ReviewStatus
  self_comment: string | null
  manager_comment: string | null
  manager_score: number | null
  return_reason: string | null
  kpi_snapshot: KpiRow[] | null
  user?: { id: string; display_name: string | null } | null
  manager?: { id: string; display_name: string | null } | null
  cycle?: Cycle | null
  goals?: Goal[]
}

interface Props {
  isHR: boolean
  showTeamTab: boolean
  currentUserId: string
}

const REVIEW_STATUS_KEYS: Record<ReviewStatus, string> = {
  goal_setting: 'statusGoalSetting',
  goals_submitted: 'statusGoalsSubmitted',
  goals_approved: 'statusGoalsApproved',
  pending_manager: 'statusPendingManager',
  completed: 'statusCompleted',
}

const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  goal_setting: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
  goals_submitted: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
  goals_approved: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  pending_manager: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
  completed: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300',
}

const CYCLE_STATUS_KEYS: Record<CycleStatus, string> = {
  draft: 'cycleStatusDraft',
  open: 'cycleStatusOpen',
  closed: 'cycleStatusClosed',
}

const CYCLE_STATUS_COLORS: Record<CycleStatus, string> = {
  draft: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
  open: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300',
  closed: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
}

const STEP_ORDER: ReviewStatus[] = ['goal_setting', 'goals_submitted', 'goals_approved', 'pending_manager', 'completed']

const weightedScore = (goals: Goal[]) => {
  const total = goals.reduce((s, g) => s + (g.manager_rating != null ? g.weight * g.manager_rating : 0), 0)
  return Math.round((total / 100) * 100) / 100
}

function StatusStepper({ status, t }: { status: ReviewStatus; t: ReturnType<typeof useTranslations> }) {
  const currentIdx = STEP_ORDER.indexOf(status)
  return (
    <ol className="flex items-center gap-1 flex-wrap" aria-label={t('progress')}>
      {STEP_ORDER.map((step, i) => (
        <li key={step} className="flex items-center gap-1">
          <span
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
              i < currentIdx
                ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300'
                : i === currentIdx
                  ? 'bg-blue-50 text-blue-700 border-blue-200 font-medium dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
            }`}
          >
            {i < currentIdx && <Check size={12} aria-hidden />}
            {t(REVIEW_STATUS_KEYS[step])}
          </span>
          {i < STEP_ORDER.length - 1 && <span className="text-slate-300 text-xs" aria-hidden>›</span>}
        </li>
      ))}
    </ol>
  )
}

function RatingInput({ value, onChange, label, disabled }: {
  value: number | null
  onChange?: (v: number) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${label}: ${n}`}
          disabled={disabled}
          onClick={() => onChange?.(n)}
          className={`w-7 h-7 rounded-full text-xs font-medium border transition-colors tabular-nums ${
            value === n
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-500 border-slate-300 hover:bg-blue-50 dark:bg-slate-800 dark:border-slate-600'
          } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function KpiCard({ rows, t }: { rows: KpiRow[]; t: ReturnType<typeof useTranslations> }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('kpiTitle')}</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">{t('kpiEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1.5 pr-2 font-medium">{t('kpiName')}</th>
                  <th className="py-1.5 pr-2 font-medium text-right">{t('kpiTarget')}</th>
                  <th className="py-1.5 pr-2 font-medium text-right">{t('kpiActual')}</th>
                  <th className="py-1.5 font-medium">{t('kpiUnit')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.kpi_id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-300">
                      {r.name}
                      <span className="text-xs text-slate-400 ml-1">
                        ({t(r.period === 'monthly' ? 'kpiMonthly' : 'kpiYearly')})
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{r.target}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums font-medium text-slate-800 dark:text-slate-200">{r.actual}</td>
                    <td className="py-1.5 text-xs text-slate-400">{r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function PerformanceClient({ isHR, showTeamTab, currentUserId }: Props) {
  const t = useTranslations('performance')
  type Tab = 'mine' | 'team' | 'cycles'
  const [tab, setTab] = useState<Tab>('mine')
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [cycleId, setCycleId] = useState('')
  const [cyclesLoaded, setCyclesLoaded] = useState(false)

  const loadCycles = useCallback(async () => {
    try {
      const res = await fetch('/api/performance/cycles')
      if (!res.ok) throw new Error()
      const json = await res.json()
      const list: Cycle[] = json.data ?? []
      setCycles(list)
      setCycleId(prev => {
        if (prev && list.some(c => c.id === prev)) return prev
        return (list.find(c => c.status === 'open') ?? list[0])?.id ?? ''
      })
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setCyclesLoaded(true)
    }
  }, [t])

  useEffect(() => { loadCycles() }, [loadCycles])

  const selectedCycle = cycles.find(c => c.id === cycleId) ?? null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mine', label: t('tabMine') },
    ...(showTeamTab ? [{ key: 'team' as Tab, label: t('tabTeam') }] : []),
    ...(isHR ? [{ key: 'cycles' as Tab, label: t('tabCycles') }] : []),
  ]

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === item.key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab !== 'cycles' && (
        cyclesLoaded && cycles.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">{t('noCycles')}</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor="perf-cycle-select" className="text-xs text-slate-500">{t('selectCycle')}</label>
            <select
              id="perf-cycle-select"
              value={cycleId}
              onChange={e => setCycleId(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {cycles.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.start_date} ~ {c.end_date}）
                </option>
              ))}
            </select>
            {selectedCycle && (
              <Badge className={`text-xs border ${CYCLE_STATUS_COLORS[selectedCycle.status]}`}>
                {t(CYCLE_STATUS_KEYS[selectedCycle.status])}
              </Badge>
            )}
          </div>
        )
      )}

      {tab === 'mine' && selectedCycle && (
        <MyReviewTab key={selectedCycle.id} cycle={selectedCycle} t={t} />
      )}
      {tab === 'team' && selectedCycle && (
        <TeamTab key={selectedCycle.id} cycle={selectedCycle} isHR={isHR} currentUserId={currentUserId} t={t} />
      )}
      {tab === 'cycles' && isHR && (
        <CyclesTab cycles={cycles} reload={loadCycles} t={t} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 我的考核
// ─────────────────────────────────────────────────────────────
function MyReviewTab({ cycle, t }: { cycle: Cycle; t: ReturnType<typeof useTranslations> }) {
  const [review, setReview] = useState<Review | null>(null)
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState<KpiRow[]>([])
  const [starting, setStarting] = useState(false)

  const loadReview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/performance/reviews?view=mine&cycle_id=${cycle.id}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      const head: Review | undefined = (json.data ?? [])[0]
      if (!head) { setReview(null); return }
      const detailRes = await fetch(`/api/performance/reviews/${head.id}`)
      if (!detailRes.ok) throw new Error()
      const detail = await detailRes.json()
      setReview(detail.data)
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [cycle.id, t])

  useEffect(() => { loadReview() }, [loadReview])

  useEffect(() => {
    fetch(`/api/performance/kpi-summary?cycle_id=${cycle.id}`)
      .then(res => (res.ok ? res.json() : { data: [] }))
      .then(json => setKpi(json.data ?? []))
      .catch(() => setKpi([]))
  }, [cycle.id])

  const startReview = async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/performance/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle_id: cycle.id }),
      })
      if (!res.ok) throw new Error()
      await loadReview()
      toast.success(t('reviewStarted'))
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">…</p>

  if (!review) {
    return (
      <Card>
        <CardContent className="pt-6 pb-6 text-center space-y-3">
          <p className="text-sm text-slate-500">{t('notStarted')}</p>
          {cycle.status === 'open' ? (
            <Button onClick={startReview} disabled={starting}>
              <Plus size={14} className="mr-1" />{starting ? t('submitting') : t('startReview')}
            </Button>
          ) : (
            <p className="text-xs text-slate-400">{t('cycleNotOpen')}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <StatusStepper status={review.status} t={t} />
      {review.status === 'goal_setting' && review.return_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {t('returnedBanner')}：{review.return_reason}
        </div>
      )}
      <GoalsEditor review={review} cycle={cycle} reload={loadReview} t={t} />
      {(review.status === 'goals_approved' || review.status === 'pending_manager' || review.status === 'completed') && (
        <SelfAssessment review={review} reload={loadReview} t={t} />
      )}
      {review.status === 'completed' && <CompletedResult review={review} t={t} />}
      <KpiCard rows={review.status === 'completed' && review.kpi_snapshot ? review.kpi_snapshot : kpi} t={t} />
    </div>
  )
}

// 目標設定/檢視
function GoalsEditor({ review, cycle, reload, t }: {
  review: Review
  cycle: Cycle
  reload: () => Promise<void>
  t: ReturnType<typeof useTranslations>
}) {
  const goals = review.goals ?? []
  const editable = review.status === 'goal_setting' && cycle.status === 'open'
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [weight, setWeight] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const weightSum = goals.reduce((s, g) => s + g.weight, 0)

  const resetForm = () => { setTitle(''); setDescription(''); setWeight(''); setEditingId(null) }

  const saveGoal = async () => {
    const w = Number(weight)
    if (!title.trim() || !Number.isInteger(w) || w < 0 || w > 100) {
      toast.error(t('requiredFields'))
      return
    }
    setBusy(true)
    try {
      const res = editingId
        ? await fetch(`/api/performance/goals/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title.trim(), description: description.trim() || null, weight: w }),
          })
        : await fetch('/api/performance/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ review_id: review.id, title: title.trim(), description: description.trim() || null, weight: w }),
          })
      if (!res.ok) throw new Error()
      resetForm()
      await reload()
      toast.success(t('goalSaved'))
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const deleteGoal = async (id: string) => {
    if (!confirm(t('deleteGoalConfirm'))) return
    const res = await fetch(`/api/performance/goals/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error(t('saveFailed')); return }
    await reload()
    toast.success(t('goalDeleted'))
  }

  const submitGoals = async () => {
    if (!confirm(t('submitGoalsConfirm'))) return
    const res = await fetch(`/api/performance/reviews/${review.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit_goals' }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      toast.error(json?.code === 'WEIGHT_NOT_100' ? t('weightMustBe100') : t('saveFailed'))
      return
    }
    await reload()
    toast.success(t('goalsSubmittedToast'))
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('goals')}</h3>
          <span className={`text-xs tabular-nums ${weightSum === 100 ? 'text-green-600' : 'text-yellow-700'}`}>
            {t('weightSum')}: {weightSum}%
          </span>
        </div>

        {goals.length === 0 && <p className="text-sm text-slate-400 text-center py-4">{t('noGoals')}</p>}

        <ul className="space-y-2">
          {goals.map(g => (
            <li key={g.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{g.title}</span>
                  <span className="text-xs text-slate-400 tabular-nums">{g.weight}%</span>
                </div>
                {g.description && (
                  <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap break-words">{g.description}</p>
                )}
              </div>
              {editable && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon" aria-label={t('editGoal')}
                    className="h-8 w-8 text-slate-400 hover:text-blue-600"
                    onClick={() => {
                      setEditingId(g.id)
                      setTitle(g.title)
                      setDescription(g.description ?? '')
                      setWeight(String(g.weight))
                    }}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost" size="icon" aria-label={t('deleteGoal')}
                    className="h-8 w-8 text-slate-400 hover:text-red-500"
                    onClick={() => deleteGoal(g.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {editable && (
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-48">
                <label htmlFor="perf-goal-title" className="block text-xs text-slate-500 mb-1">
                  {t('goalTitle')} <span className="text-red-500">*</span>
                </label>
                <Input id="perf-goal-title" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="w-28">
                <label htmlFor="perf-goal-weight" className="block text-xs text-slate-500 mb-1">
                  {t('weight')} (%) <span className="text-red-500">*</span>
                </label>
                <Input
                  id="perf-goal-weight" type="number" min={0} max={100} value={weight}
                  onChange={e => setWeight(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label htmlFor="perf-goal-desc" className="block text-xs text-slate-500 mb-1">{t('goalDescription')}</label>
              <Textarea id="perf-goal-desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={saveGoal} disabled={busy} variant="secondary">
                <Plus size={14} className="mr-1" />{editingId ? t('saveGoal') : t('addGoal')}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={resetForm}>{t('cancelEdit')}</Button>
              )}
              <div className="flex-1" />
              <Button onClick={submitGoals} disabled={goals.length === 0 || weightSum !== 100}>
                <Send size={14} className="mr-1" />{t('submitGoals')}
              </Button>
            </div>
            {weightSum !== 100 && goals.length > 0 && (
              <p className="text-xs text-yellow-700">{t('weightMustBe100')}</p>
            )}
          </div>
        )}

        {review.status === 'goals_submitted' && (
          <p className="text-xs text-slate-400">{t('waitingApproval')}</p>
        )}
      </CardContent>
    </Card>
  )
}

// 自評
function SelfAssessment({ review, reload, t }: {
  review: Review
  reload: () => Promise<void>
  t: ReturnType<typeof useTranslations>
}) {
  const goals = review.goals ?? []
  const editable = review.status === 'goals_approved'
  const [comment, setComment] = useState(review.self_comment ?? '')
  const [notes, setNotes] = useState<Record<string, string>>(
    () => Object.fromEntries(goals.map(g => [g.id, g.self_note ?? '']))
  )
  const [busy, setBusy] = useState(false)

  const patchGoal = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/performance/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { toast.error(t('saveFailed')); return false }
    return true
  }

  const setRating = async (id: string, rating: number) => {
    if (await patchGoal(id, { self_rating: rating })) await reload()
  }

  const saveNote = async (id: string) => {
    if (await patchGoal(id, { self_note: notes[id] ?? '' })) toast.success(t('noteSaved'))
  }

  const submitSelf = async () => {
    if (!confirm(t('submitSelfConfirm'))) return
    setBusy(true)
    try {
      const res = await fetch(`/api/performance/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit_self', self_comment: comment }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        toast.error(json?.code === 'SELF_RATING_INCOMPLETE' ? t('ratingIncomplete') : t('saveFailed'))
        return
      }
      await reload()
      toast.success(t('selfSubmittedToast'))
    } finally {
      setBusy(false)
    }
  }

  const allRated = goals.every(g => g.self_rating != null)

  return (
    <Card>
      <CardContent className="pt-4 pb-3 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('selfAssessment')}</h3>
        <ul className="space-y-3">
          {goals.map(g => (
            <li key={g.id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {g.title} <span className="text-xs text-slate-400 tabular-nums">{g.weight}%</span>
                </span>
                <RatingInput
                  value={g.self_rating}
                  onChange={editable ? (v => setRating(g.id, v)) : undefined}
                  disabled={!editable}
                  label={`${t('selfRating')} — ${g.title}`}
                />
              </div>
              {editable ? (
                <div className="flex gap-2">
                  <Input
                    aria-label={`${t('selfNote')} — ${g.title}`}
                    placeholder={t('selfNote')}
                    value={notes[g.id] ?? ''}
                    onChange={e => setNotes(prev => ({ ...prev, [g.id]: e.target.value }))}
                    onBlur={() => (notes[g.id] ?? '') !== (g.self_note ?? '') && saveNote(g.id)}
                  />
                </div>
              ) : (
                g.self_note && <p className="text-xs text-slate-500 whitespace-pre-wrap">{g.self_note}</p>
              )}
            </li>
          ))}
        </ul>
        <div>
          <label htmlFor="perf-self-comment" className="block text-xs text-slate-500 mb-1">{t('selfComment')}</label>
          {editable ? (
            <Textarea id="perf-self-comment" rows={3} value={comment} onChange={e => setComment(e.target.value)} />
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
              {review.self_comment || '—'}
            </p>
          )}
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            <Button onClick={submitSelf} disabled={busy || !allRated}>
              <Send size={14} className="mr-1" />{busy ? t('submitting') : t('submitSelf')}
            </Button>
            {!allRated && <span className="text-xs text-yellow-700">{t('ratingIncomplete')}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// 完成結果（本人視角）
function CompletedResult({ review, t }: { review: Review; t: ReturnType<typeof useTranslations> }) {
  const goals = review.goals ?? []
  return (
    <Card>
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('resultTitle')}</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {t('weightedScore')}: <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">{weightedScore(goals)}</span>
            </span>
            <span className="text-sm font-semibold text-blue-600 tabular-nums">
              {t('finalScore')}: {review.manager_score}
            </span>
          </div>
        </div>
        <ul className="space-y-2">
          {goals.map(g => (
            <li key={g.id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {g.title} <span className="text-xs text-slate-400 tabular-nums">{g.weight}%</span>
                </span>
                <span className="text-xs text-slate-500 tabular-nums">
                  {t('selfRating')}: {g.self_rating ?? '—'}　{t('managerRating')}: {g.manager_rating ?? '—'}
                </span>
              </div>
              {g.manager_note && (
                <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{t('managerNote')}: {g.manager_note}</p>
              )}
            </li>
          ))}
        </ul>
        {review.manager_comment && (
          <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
            <span className="text-xs text-slate-400">{t('managerComment')}: </span>{review.manager_comment}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// 團隊考核
// ─────────────────────────────────────────────────────────────
function TeamTab({ cycle, isHR, currentUserId, t }: {
  cycle: Cycle
  isHR: boolean
  currentUserId: string
  t: ReturnType<typeof useTranslations>
}) {
  const [view, setView] = useState<'team' | 'all'>(isHR ? 'all' : 'team')
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  const loadReviews = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/performance/reviews?view=${view}&cycle_id=${cycle.id}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setReviews((json.data ?? []).filter((r: Review) => view === 'team' || r.user_id !== currentUserId || isHR))
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [view, cycle.id, currentUserId, isHR, t])

  useEffect(() => { loadReviews() }, [loadReviews])

  return (
    <div className="space-y-2">
      {isHR && (
        <div className="flex items-center gap-1">
          {(['team', 'all'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
                view === v
                  ? 'bg-blue-50 text-blue-700 border-blue-200 font-medium dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-white text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
              }`}
            >
              {t(v === 'team' ? 'viewTeam' : 'viewAll')}
            </button>
          ))}
        </div>
      )}
      {loading && <p className="text-sm text-slate-400">…</p>}
      {!loading && reviews.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">{t('teamNoReviews')}</p>
      )}
      {reviews.map(r => (
        <Card key={r.id}>
          <CardContent className="pt-3 pb-3">
            <button
              className="w-full flex items-center justify-between gap-2 cursor-pointer text-left"
              onClick={() => setOpenId(openId === r.id ? null : r.id)}
              aria-expanded={openId === r.id}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {r.user?.display_name ?? '—'}
                </span>
                <Badge className={`text-xs border ${REVIEW_STATUS_COLORS[r.status]}`}>
                  {t(REVIEW_STATUS_KEYS[r.status])}
                </Badge>
                {r.manager?.display_name && (
                  <span className="text-xs text-slate-400">{t('managerLabel')}: {r.manager.display_name}</span>
                )}
                {r.manager_score != null && (
                  <span className="text-xs text-slate-500 tabular-nums">{t('finalScore')}: {r.manager_score}</span>
                )}
              </div>
              {openId === r.id ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
            </button>
            {openId === r.id && (
              <TeamReviewDetail reviewId={r.id} isHR={isHR} reloadList={loadReviews} t={t} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TeamReviewDetail({ reviewId, isHR, reloadList, t }: {
  reviewId: string
  isHR: boolean
  reloadList: () => Promise<void>
  t: ReturnType<typeof useTranslations>
}) {
  const [review, setReview] = useState<Review | null>(null)
  const [kpi, setKpi] = useState<KpiRow[]>([])
  const [managerScore, setManagerScore] = useState('')
  const [managerComment, setManagerComment] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/performance/reviews/${reviewId}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      const r: Review = json.data
      setReview(r)
      setManagerComment(r.manager_comment ?? '')
      setManagerScore(r.manager_score != null ? String(r.manager_score) : '')
      setNotes(Object.fromEntries((r.goals ?? []).map(g => [g.id, g.manager_note ?? ''])))
      if (r.status === 'completed' && r.kpi_snapshot) {
        setKpi(r.kpi_snapshot)
      } else {
        const kpiRes = await fetch(`/api/performance/kpi-summary?cycle_id=${r.cycle_id}&user_id=${r.user_id}`)
        if (kpiRes.ok) setKpi((await kpiRes.json()).data ?? [])
      }
    } catch {
      toast.error(t('loadFailed'))
    }
  }, [reviewId, t])

  useEffect(() => { loadDetail() }, [loadDetail])

  if (!review) return <p className="text-sm text-slate-400 mt-3">…</p>

  const goals = review.goals ?? []
  const canRate = review.status === 'pending_manager'

  const act = async (body: Record<string, unknown>, successMsg: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/performance/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        if (json?.code === 'MFA_REQUIRED') toast.error(t('mfaRequired'))
        else if (json?.code === 'MANAGER_RATING_INCOMPLETE') toast.error(t('ratingIncomplete'))
        else toast.error(t('saveFailed'))
        return
      }
      toast.success(successMsg)
      await loadDetail()
      await reloadList()
    } finally {
      setBusy(false)
    }
  }

  const patchGoal = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/performance/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { toast.error(t('saveFailed')); return false }
    return true
  }

  const approveGoals = () => {
    if (!confirm(t('approveGoalsConfirm'))) return
    act({ action: 'approve_goals' }, t('goalsApprovedToast'))
  }
  const returnGoals = () => {
    const reason = prompt(t('returnReasonPrompt'))
    if (reason === null) return
    act({ action: 'return_goals', return_reason: reason }, t('goalsReturnedToast'))
  }
  const complete = () => {
    const score = Number(managerScore)
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      toast.error(t('scoreRange'))
      return
    }
    if (!confirm(t('completeConfirm'))) return
    act({ action: 'complete', manager_score: score, manager_comment: managerComment }, t('completedToast'))
  }
  const reopen = () => {
    if (!confirm(t('reopenConfirm'))) return
    act({ action: 'reopen' }, t('reopenedToast'))
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
      {review.self_comment && (
        <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
          <span className="text-xs text-slate-400">{t('selfComment')}: </span>{review.self_comment}
        </p>
      )}
      {goals.length === 0 && <p className="text-sm text-slate-400">{t('noGoals')}</p>}
      <ul className="space-y-2">
        {goals.map(g => (
          <li key={g.id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {g.title} <span className="text-xs text-slate-400 tabular-nums">{g.weight}%</span>
                </span>
                {g.description && (
                  <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap break-words">{g.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-slate-400 tabular-nums">{t('selfRating')}: {g.self_rating ?? '—'}</span>
                <RatingInput
                  value={g.manager_rating}
                  onChange={canRate ? (async v => { if (await patchGoal(g.id, { manager_rating: v })) await loadDetail() }) : undefined}
                  disabled={!canRate}
                  label={`${t('managerRating')} — ${g.title}`}
                />
              </div>
            </div>
            {g.self_note && <p className="text-xs text-slate-500 whitespace-pre-wrap">{t('selfNote')}: {g.self_note}</p>}
            {canRate ? (
              <Input
                aria-label={`${t('managerNote')} — ${g.title}`}
                placeholder={t('managerNote')}
                value={notes[g.id] ?? ''}
                onChange={e => setNotes(prev => ({ ...prev, [g.id]: e.target.value }))}
                onBlur={async () => {
                  if ((notes[g.id] ?? '') !== (g.manager_note ?? '') && await patchGoal(g.id, { manager_note: notes[g.id] ?? '' })) {
                    toast.success(t('noteSaved'))
                  }
                }}
              />
            ) : (
              g.manager_note && <p className="text-xs text-slate-500 whitespace-pre-wrap">{t('managerNote')}: {g.manager_note}</p>
            )}
          </li>
        ))}
      </ul>

      {review.status === 'goals_submitted' && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={approveGoals} disabled={busy} className="text-xs text-green-600 hover:text-green-700">
            <Check size={14} className="mr-1" />{t('approveGoals')}
          </Button>
          <Button variant="ghost" size="sm" onClick={returnGoals} disabled={busy} className="text-xs text-red-500 hover:text-red-600">
            <X size={14} className="mr-1" />{t('returnGoals')}
          </Button>
        </div>
      )}

      {canRate && (
        <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="flex gap-2 flex-wrap items-end">
            <div className="w-32">
              <label htmlFor={`perf-score-${review.id}`} className="block text-xs text-slate-500 mb-1">
                {t('managerScore')} (1–5) <span className="text-red-500">*</span>
              </label>
              <Input
                id={`perf-score-${review.id}`} type="number" min={1} max={5} step={0.5}
                value={managerScore} onChange={e => setManagerScore(e.target.value)}
              />
            </div>
            <span className="text-xs text-slate-400 pb-2 tabular-nums">
              {t('weightedScore')}: {weightedScore(goals)}
            </span>
          </div>
          <div>
            <label htmlFor={`perf-comment-${review.id}`} className="block text-xs text-slate-500 mb-1">{t('managerComment')}</label>
            <Textarea
              id={`perf-comment-${review.id}`} rows={3}
              value={managerComment} onChange={e => setManagerComment(e.target.value)}
            />
          </div>
          <Button onClick={complete} disabled={busy}>
            <Check size={14} className="mr-1" />{busy ? t('submitting') : t('completeReview')}
          </Button>
        </div>
      )}

      {review.status === 'completed' && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm font-semibold text-blue-600 tabular-nums">
            {t('finalScore')}: {review.manager_score}
          </span>
          {isHR && (
            <Button variant="ghost" size="sm" onClick={reopen} disabled={busy} className="text-xs text-slate-500 hover:text-slate-700">
              <RotateCcw size={14} className="mr-1" />{t('reopenReview')}
            </Button>
          )}
        </div>
      )}

      <KpiCard rows={kpi} t={t} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 週期管理（HR/admin）
// ─────────────────────────────────────────────────────────────
function CyclesTab({ cycles, reload, t }: {
  cycles: Cycle[]
  reload: () => Promise<void>
  t: ReturnType<typeof useTranslations>
}) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [busy, setBusy] = useState(false)

  const createCycle = async () => {
    if (!name.trim() || !startDate || !endDate || endDate < startDate) {
      toast.error(t('requiredFields'))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/performance/cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), start_date: startDate, end_date: endDate }),
      })
      if (!res.ok) throw new Error()
      setName(''); setStartDate(''); setEndDate('')
      await reload()
      toast.success(t('cycleCreated'))
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const patchCycle = async (id: string, status: CycleStatus, confirmMsg: string, successMsg: string) => {
    if (!confirm(confirmMsg)) return
    const res = await fetch(`/api/performance/cycles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) { toast.error(t('saveFailed')); return }
    await reload()
    toast.success(successMsg)
  }

  const deleteCycle = async (id: string) => {
    if (!confirm(t('deleteCycleConfirm'))) return
    const res = await fetch(`/api/performance/cycles/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error(t('saveFailed')); return }
    await reload()
    toast.success(t('cycleDeleted'))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('createCycle')}</h3>
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-48">
              <label htmlFor="perf-cycle-name" className="block text-xs text-slate-500 mb-1">
                {t('cycleName')} <span className="text-red-500">*</span>
              </label>
              <Input id="perf-cycle-name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="perf-cycle-start" className="block text-xs text-slate-500 mb-1">
                {t('startDate')} <span className="text-red-500">*</span>
              </label>
              <input
                id="perf-cycle-start" type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="perf-cycle-end" className="block text-xs text-slate-500 mb-1">
                {t('endDate')} <span className="text-red-500">*</span>
              </label>
              <input
                id="perf-cycle-end" type="date" value={endDate} min={startDate}
                onChange={e => setEndDate(e.target.value)}
                className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <Button onClick={createCycle} disabled={busy}>
            <Plus size={14} className="mr-1" />{busy ? t('submitting') : t('createCycle')}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {cycles.length === 0 && <p className="text-sm text-slate-400 text-center py-8">{t('noCycles')}</p>}
        {cycles.map(c => (
          <Card key={c.id}>
            <CardContent className="pt-3 pb-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.name}</span>
                <span className="text-xs text-slate-400 tabular-nums">{c.start_date} ~ {c.end_date}</span>
                <Badge className={`text-xs border ${CYCLE_STATUS_COLORS[c.status]}`}>
                  {t(CYCLE_STATUS_KEYS[c.status])}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {(c.status === 'draft' || c.status === 'closed') && (
                  <Button
                    variant="ghost" size="sm" className="text-xs text-green-600 hover:text-green-700"
                    onClick={() => patchCycle(c.id, 'open', t('openCycleConfirm'), t('cycleOpened'))}
                  >
                    {t('openCycle')}
                  </Button>
                )}
                {c.status === 'open' && (
                  <Button
                    variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-slate-700"
                    onClick={() => patchCycle(c.id, 'closed', t('closeCycleConfirm'), t('cycleClosed'))}
                  >
                    {t('closeCycle')}
                  </Button>
                )}
                {c.status === 'draft' && (
                  <Button
                    variant="ghost" size="icon" aria-label={t('deleteCycle')}
                    className="h-8 w-8 text-slate-400 hover:text-red-500"
                    onClick={() => deleteCycle(c.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
