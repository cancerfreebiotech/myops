'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, X, Check, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type Kind = 'onboarding' | 'offboarding'
type Status = 'active' | 'completed'
type Category = 'account' | 'equipment' | 'access' | 'handover' | 'hr' | 'other'

interface ChecklistItem {
  id: string
  title: string
  category: Category
  done: boolean
  done_at: string | null
  note: string | null
  sort_order: number
}

interface ChecklistUser {
  id: string
  display_name: string | null
  email: string
}

interface Checklist {
  id: string
  kind: Kind
  status: Status
  created_at: string
  user: ChecklistUser | null
  items: ChecklistItem[]
}

interface AllUser {
  id: string
  display_name: string | null
  email: string
}

interface Props {
  allUsers: AllUser[]
}

const CATEGORIES: Category[] = ['account', 'equipment', 'access', 'handover', 'hr', 'other']
const CATEGORY_KEYS: Record<Category, string> = {
  account: 'catAccount',
  equipment: 'catEquipment',
  access: 'catAccess',
  handover: 'catHandover',
  hr: 'catHr',
  other: 'catOther',
}
const KIND_KEYS: Record<Kind, string> = { onboarding: 'kindOnboarding', offboarding: 'kindOffboarding' }
const STATUS_KEYS: Record<Status, string> = { active: 'statusActive', completed: 'statusCompleted' }

const KIND_COLORS: Record<Kind, string> = {
  onboarding: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
  offboarding: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300',
}
const STATUS_COLORS: Record<Status, string> = {
  active: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  completed: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
}

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(iso)) : ''

export function LifecycleClient({ allUsers }: Props) {
  const t = useTranslations('lifecycle')
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Create form
  const [selectedUserId, setSelectedUserId] = useState('')
  const [kind, setKind] = useState<Kind>('onboarding')
  const [creating, setCreating] = useState(false)

  // Inline add-item drafts, keyed by checklist id
  const [newItem, setNewItem] = useState<Record<string, { title: string; category: Category }>>({})
  const [addingId, setAddingId] = useState<string | null>(null)

  const loadChecklists = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lifecycle')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setChecklists(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const load = async () => { await loadChecklists() }
    load()
  }, [loadChecklists])

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const createChecklist = async () => {
    if (!selectedUserId) {
      toast.error(t('requiredFields'))
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedUserId, kind }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('created'))
      setSelectedUserId('')
      await loadChecklists()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setCreating(false)
    }
  }

  const patchChecklist = async (id: string, body: Record<string, unknown>, successMsg?: string) => {
    const res = await fetch(`/api/admin/lifecycle/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      toast.error(t('saveFailed'))
      return false
    }
    if (successMsg) toast.success(successMsg)
    await loadChecklists()
    return true
  }

  const toggleItemDone = async (checklist: Checklist, item: ChecklistItem) => {
    const willBeDone = !item.done
    const ok = await patchChecklist(checklist.id, { item_id: item.id, done: willBeDone })
    // 反勾「已完成」清單中的項目時，同步把清單狀態回退為 active，
    // 避免出現「狀態=已完成」卻仍有未完成項的不一致。
    if (ok && !willBeDone && checklist.status === 'completed') {
      await patchChecklist(checklist.id, { status: 'active' }, t('reopened'))
    }
  }

  const editNote = async (checklistId: string, item: ChecklistItem) => {
    const note = prompt(t('notePrompt'), item.note ?? '')
    if (note === null) return
    await patchChecklist(checklistId, { item_id: item.id, note }, t('noteSaved'))
  }

  const deleteItem = async (checklistId: string, itemId: string) => {
    if (!confirm(t('deleteItemConfirm'))) return
    const res = await fetch(`/api/admin/lifecycle/${checklistId}?item_id=${itemId}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(t('saveFailed'))
      return
    }
    toast.success(t('itemDeleted'))
    await loadChecklists()
  }

  const addItem = async (checklistId: string) => {
    const draft = newItem[checklistId] ?? { title: '', category: 'other' as Category }
    if (!draft.title.trim()) {
      toast.error(t('requiredFields'))
      return
    }
    setAddingId(checklistId)
    try {
      const res = await fetch(`/api/admin/lifecycle/${checklistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add_item: { title: draft.title.trim(), category: draft.category } }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('itemAdded'))
      setNewItem(prev => ({ ...prev, [checklistId]: { title: '', category: 'other' } }))
      await loadChecklists()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setAddingId(null)
    }
  }

  const setChecklistStatus = (id: string, status: Status) =>
    patchChecklist(id, { status }, status === 'completed' ? t('completed') : t('reopened'))

  const deleteChecklist = async (id: string) => {
    if (!confirm(t('deleteChecklistConfirm'))) return
    const res = await fetch(`/api/admin/lifecycle/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(t('saveFailed'))
      return
    }
    toast.success(t('deleted'))
    await loadChecklists()
  }

  const renderChecklist = (c: Checklist) => {
    const total = c.items.length
    const doneCount = c.items.filter(i => i.done).length
    const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0
    const expanded = expandedIds.has(c.id)
    const allDone = total > 0 && doneCount === total
    const draft = newItem[c.id] ?? { title: '', category: 'other' as Category }

    return (
      <Card key={c.id}>
        <CardContent className="pt-4 pb-3">
          <button
            onClick={() => toggleExpand(c.id)}
            className="w-full flex items-start justify-between gap-2 text-left cursor-pointer"
            aria-expanded={expanded}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {c.user?.display_name ?? c.user?.email ?? '—'}
                </span>
                <Badge className={`text-xs border ${KIND_COLORS[c.kind]}`}>{t(KIND_KEYS[c.kind])}</Badge>
                <Badge className={`text-xs border ${STATUS_COLORS[c.status]}`}>{t(STATUS_KEYS[c.status])}</Badge>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 max-w-[160px] h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-slate-400 tabular-nums">
                  {doneCount}/{total} {t('progress')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{fmtDate(c.created_at)}</p>
            </div>
            <ChevronDown
              size={16}
              className={`shrink-0 text-slate-400 transition-transform mt-1 ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>

          {expanded && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
              {c.items.map(item => (
                <div key={item.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleItemDone(c, item)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
                    aria-label={item.title}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        {item.title}
                      </span>
                      <Badge variant="outline" className="text-xs">{t(CATEGORY_KEYS[item.category])}</Badge>
                      {item.done && item.done_at && (
                        <span className="text-xs text-slate-400">{t('doneAt')}: {fmtDate(item.done_at)}</span>
                      )}
                    </div>
                    {item.note && <p className="text-xs text-slate-500 mt-0.5 break-words">「{item.note}」</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => editNote(c.id, item)}
                      aria-label={t('notePrompt')}
                      className="h-7 w-7 text-slate-400 hover:text-blue-500"
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteItem(c.id, item.id)}
                      aria-label={t('deleteItem')}
                      className="h-7 w-7 text-slate-400 hover:text-red-500"
                    >
                      <X size={13} />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Add item inline */}
              <div className="flex items-center gap-2 pt-2 flex-wrap">
                <Input
                  value={draft.title}
                  onChange={e => setNewItem(prev => ({ ...prev, [c.id]: { title: e.target.value, category: draft.category } }))}
                  placeholder={t('itemTitle')}
                  className="flex-1 min-w-[140px]"
                />
                <select
                  value={draft.category}
                  onChange={e => setNewItem(prev => ({ ...prev, [c.id]: { title: draft.title, category: e.target.value as Category } }))}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{t(CATEGORY_KEYS[cat])}</option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addItem(c.id)}
                  disabled={addingId === c.id}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus size={14} className="mr-1" />{addingId === c.id ? t('submitting') : t('addItem')}
                </Button>
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between pt-2">
                <div>
                  {c.status === 'active' && allDone && (
                    <Button size="sm" onClick={() => setChecklistStatus(c.id, 'completed')} className="text-xs">
                      <Check size={14} className="mr-1" />{t('complete')}
                    </Button>
                  )}
                  {c.status === 'completed' && (
                    <Button variant="outline" size="sm" onClick={() => setChecklistStatus(c.id, 'active')} className="text-xs">
                      {t('reopen')}
                    </Button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteChecklist(c.id)}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  <Trash2 size={14} className="mr-1" />{t('deleteChecklist')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Create checklist */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('selectUser')}</label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
              >
                <option value="">{t('selectUser')}</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.display_name ?? u.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('kind')}</label>
              <select
                value={kind}
                onChange={e => setKind(e.target.value as Kind)}
                className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="onboarding">{t('kindOnboarding')}</option>
                <option value="offboarding">{t('kindOffboarding')}</option>
              </select>
            </div>
            <Button onClick={createChecklist} disabled={creating}>
              <Plus size={14} className="mr-1" />{creating ? t('submitting') : t('create')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Checklist list */}
      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-400">…</p>}
        {!loading && checklists.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">{t('noChecklists')}</p>
        )}
        {checklists.map(renderChecklist)}
      </div>
    </div>
  )
}
