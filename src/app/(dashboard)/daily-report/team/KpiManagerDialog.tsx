'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { DrKpiDefinition, DrKpiPeriod } from '@/lib/daily-report/types'

// dr_kpi_definitions.active 於 20260722100005 migration 新增
type KpiDef = DrKpiDefinition & { active: boolean }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: { user_id: string; display_name: string | null; email: string }[]
  initialMemberId: string | null
  /** 有任何新增/修改/刪除時，關閉後通知父層重新載入團隊資料 */
  onChanged: () => void
}

// cat 為資料值（schema default '量化'），非 UI 文字 —— 顯示端直接呈現此值
const CAT_VALUES = ['量化', '質化'] as const

interface FormState {
  name: string
  cat: string
  target: string
  unit: string
  period: DrKpiPeriod
}

const emptyForm: FormState = { name: '', cat: CAT_VALUES[0], target: '', unit: '', period: 'monthly' }

const selectClass =
  'border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

export function KpiManagerDialog({ open, onOpenChange, members, initialMemberId, onChanged }: Props) {
  const t = useTranslations('dailyReport')
  const [memberId, setMemberId] = useState<string>('')
  const [defs, setDefs] = useState<KpiDef[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // 開啟時定位到指定成員（或第一位）
  useEffect(() => {
    if (!open) return
    setMemberId(initialMemberId ?? members[0]?.user_id ?? '')
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setDirty(false)
  }, [open, initialMemberId, members])

  const loadDefs = useCallback(async () => {
    if (!memberId) { setDefs([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/daily-report/kpi-definitions?userId=${memberId}&includeInactive=1`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setDefs(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
      setDefs([])
    } finally {
      setLoading(false)
    }
  }, [memberId, t])

  useEffect(() => { if (open) loadDefs() }, [open, loadDefs])

  const close = (next: boolean) => {
    if (!next && dirty) onChanged()
    onOpenChange(next)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (def: KpiDef) => {
    setEditingId(def.id)
    setForm({
      name: def.name,
      cat: def.cat,
      target: String(def.target),
      unit: def.unit,
      period: def.period,
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name.trim() || !memberId) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        cat: form.cat,
        unit: form.unit.trim(),
        target: Number(form.target) || 0,
        period: form.period,
      }
      const res = editingId
        ? await fetch(`/api/daily-report/kpi-definitions/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/daily-report/kpi-definitions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              user_id: memberId,
              kpi_id: crypto.randomUUID(),
              sort_order: defs.length,
            }),
          })
      if (!res.ok) throw new Error()
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      setDirty(true)
      toast.success(t('saved'))
      loadDefs()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (def: KpiDef) => {
    const res = await fetch(`/api/daily-report/kpi-definitions/${def.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !def.active }),
    })
    if (!res.ok) {
      toast.error(t('saveFailed'))
      return
    }
    setDirty(true)
    toast.success(t('saved'))
    loadDefs()
  }

  const deleteDef = async (def: KpiDef) => {
    if (!confirm(t('confirmDeleteKpi'))) return
    const res = await fetch(`/api/daily-report/kpi-definitions/${def.id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(t('deleteFailed'))
      return
    }
    setDirty(true)
    toast.success(t('deleted'))
    loadDefs()
  }

  const memberName = (id: string) => {
    const m = members.find(m => m.user_id === id)
    return m?.display_name ?? m?.email ?? id
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('kpiManage')}</DialogTitle>
          <DialogDescription>{t('kpiManageHint')}</DialogDescription>
        </DialogHeader>

        {/* Member selector */}
        <div className="space-y-1.5">
          <label htmlFor="kpi-member" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('selectMember')}
          </label>
          <select
            id="kpi-member"
            value={memberId}
            onChange={e => { setMemberId(e.target.value); setShowForm(false); setEditingId(null) }}
            className={selectClass}
          >
            {members.map(m => (
              <option key={m.user_id} value={m.user_id}>{m.display_name ?? m.email}</option>
            ))}
          </select>
        </div>

        {/* KPI list */}
        {loading && <p className="text-sm text-slate-400 py-2">{t('loading')}</p>}

        {!loading && memberId && (
          <div className="space-y-2">
            {defs.length === 0 && !showForm && (
              <p className="text-sm text-slate-400 text-center py-4">{t('noKpiForMember')}</p>
            )}
            {defs.map(def => (
              <div
                key={def.id}
                className={`flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 ${
                  def.active ? '' : 'opacity-60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{def.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {def.cat === '量化' ? t('catQuant') : def.cat === '質化' ? t('catQual') : def.cat}
                    </Badge>
                    {!def.active && (
                      <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">
                        {t('kpiInactive')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                    {t('target')}: {def.target} {def.unit} · {def.period === 'monthly' ? t('periodMonthly') : t('periodYearly')}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(def)}
                    aria-label={t('editKpi')}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => toggleActive(def)}
                    aria-label={def.active ? t('deactivate') : t('activate')}
                    className={def.active ? 'text-slate-400 hover:text-amber-600' : 'text-slate-400 hover:text-green-600'}
                  >
                    <Power size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => deleteDef(def)}
                    aria-label={t('delete')}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
            {defs.length > 0 && (
              <p className="text-xs text-slate-400">{t('deactivateHint')}</p>
            )}
          </div>
        )}

        {/* Create / edit form */}
        {showForm ? (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 p-3 space-y-3">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {editingId ? t('editKpi') : t('newKpi')} — {memberName(memberId)}
            </p>
            <div className="space-y-1.5">
              <label htmlFor="kpi-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('kpiName')} <span className="text-red-500">*</span>
              </label>
              <Input
                id="kpi-name"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('kpiNamePlaceholder')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="kpi-cat" className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('kpiCat')}</label>
                <select
                  id="kpi-cat"
                  value={form.cat}
                  onChange={e => setForm(prev => ({ ...prev, cat: e.target.value }))}
                  className={selectClass}
                >
                  <option value={CAT_VALUES[0]}>{t('catQuant')}</option>
                  <option value={CAT_VALUES[1]}>{t('catQual')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="kpi-period" className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('kpiPeriod')}</label>
                <select
                  id="kpi-period"
                  value={form.period}
                  onChange={e => setForm(prev => ({ ...prev, period: e.target.value as DrKpiPeriod }))}
                  className={selectClass}
                >
                  <option value="monthly">{t('periodMonthly')}</option>
                  <option value="yearly">{t('periodYearly')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="kpi-target" className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('kpiTarget')}</label>
                <Input
                  id="kpi-target"
                  type="number"
                  value={form.target}
                  onChange={e => setForm(prev => ({ ...prev, target: e.target.value }))}
                  placeholder="0"
                  className="text-right tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="kpi-unit" className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('kpiUnit')}</label>
                <Input
                  id="kpi-unit"
                  value={form.unit}
                  onChange={e => setForm(prev => ({ ...prev, unit: e.target.value }))}
                  placeholder={t('kpiUnitPlaceholder')}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? t('saving') : t('save')}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm) }}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          memberId && !loading && (
            <div>
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus size={14} className="mr-1" />{t('newKpi')}
              </Button>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  )
}
