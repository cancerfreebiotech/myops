'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown, ChevronUp, CheckCircle2, Circle, Trash2, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { DrTask, DrPriority, DrTaskStatus } from '@/lib/daily-report/types'

interface Props {
  userId: string
  isViewer: boolean
  allUsers: { id: string; display_name: string | null; email: string }[]
}

const PRIORITY_COLORS: Record<DrPriority, string> = {
  high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
  med: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
  low: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
}

const STATUS_COLORS: Record<DrTaskStatus, string> = {
  active: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
  done: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
}

export function TasksClient({ userId, isViewer, allUsers }: Props) {
  const t = useTranslations('dailyReport')
  const [tasks, setTasks] = useState<DrTask[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<DrPriority>('med')
  const [newAssignees, setNewAssignees] = useState<string[]>([])
  const [newDeadline, setNewDeadline] = useState('')

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/daily-report/tasks?mine=${!isViewer}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setTasks(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [isViewer, t])

  useEffect(() => { loadTasks() }, [loadTasks])

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleSubtask = async (taskId: string, subtaskId: string, done: boolean) => {
    const res = await fetch(`/api/daily-report/tasks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtask_id: subtaskId, done }),
    })
    if (!res.ok) { toast.error(t('saveFailed')); return }
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task
      return {
        ...task,
        subtasks: task.subtasks?.map(s => s.id === subtaskId ? { ...s, done } : s),
      }
    }))
  }

  const markMemberDone = async (taskId: string) => {
    const res = await fetch('/api/daily-report/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, member_done: true }),
    })
    if (!res.ok) { toast.error(t('saveFailed')); return }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, member_done: true } : t))
    toast.success(t('markedDone'))
  }

  const confirmDone = async (taskId: string) => {
    const res = await fetch('/api/daily-report/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status: 'done' }),
    })
    if (!res.ok) { toast.error(t('saveFailed')); return }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t))
    toast.success(t('taskConfirmedDone'))
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm(t('confirmDeleteTask'))) return
    const res = await fetch(`/api/daily-report/tasks?id=${taskId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error(t('saveFailed')); return }
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  const createTask = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/daily-report/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          content: '',
          deadline: newDeadline || null,
          priority: newPriority,
          assignee_ids: newAssignees,
          subtask_titles: [],
        }),
      })
      if (!res.ok) throw new Error()
      setNewTitle('')
      setNewDeadline('')
      setNewAssignees([])
      await loadTasks()
      toast.success(t('taskCreated'))
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setCreating(false)
    }
  }

  const activeTasks = tasks.filter(t => t.status !== 'done')
  const doneTasks = tasks.filter(t => t.status === 'done')

  return (
    <div className="space-y-4 pb-8">
      {/* Create task form (viewer/admin only) */}
      {isViewer && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">{t('newTask')}</p>
            <div className="space-y-2">
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder={t('taskTitlePlaceholder')}
                onKeyDown={e => e.key === 'Enter' && createTask()}
              />
              <div className="flex gap-2 flex-wrap">
                <select
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value as DrPriority)}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="high">{t('priorityHigh')}</option>
                  <option value="med">{t('priorityMed')}</option>
                  <option value="low">{t('priorityLow')}</option>
                </select>
                <input
                  type="date"
                  value={newDeadline}
                  onChange={e => setNewDeadline(e.target.value)}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  multiple
                  value={newAssignees}
                  onChange={e => setNewAssignees(Array.from(e.target.selectedOptions, o => o.value))}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
                  size={3}
                >
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.display_name ?? u.email}</option>
                  ))}
                </select>
              </div>
              <Button onClick={createTask} disabled={creating || !newTitle.trim()}>
                <Plus size={14} className="mr-1" />{creating ? t('creating') : t('createTask')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-slate-400">{t('loading')}</p>}

      {/* Active tasks */}
      <div className="space-y-2">
        {activeTasks.map(task => {
          const isExpanded = expanded.has(task.id)
          const completedSubtasks = task.subtasks?.filter(s => s.done).length ?? 0
          const totalSubtasks = task.subtasks?.length ?? 0

          return (
            <Card key={task.id} className={task.member_done ? 'border-yellow-200 dark:border-yellow-800' : ''}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        {task.title}
                      </span>
                      <Badge className={`text-xs border ${PRIORITY_COLORS[task.priority]}`}>
                        <Flag size={10} className="mr-1" />{t(`priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}` as any)}
                      </Badge>
                      <Badge className={`text-xs border ${STATUS_COLORS[task.status]}`}>
                        {t(`status${task.status.charAt(0).toUpperCase() + task.status.slice(1)}` as any)}
                      </Badge>
                      {task.member_done && (
                        <Badge className="text-xs border bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300">
                          {t('memberDonePending')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {task.deadline && (
                        <span className="text-xs text-slate-400">{t('deadline')}: {task.deadline}</span>
                      )}
                      {task.assignees && task.assignees.length > 0 && (
                        <span className="text-xs text-slate-400">
                          {task.assignees.map(a => a.display_name ?? a.email).join(', ')}
                        </span>
                      )}
                      {totalSubtasks > 0 && (
                        <span className="text-xs text-slate-400">{completedSubtasks}/{totalSubtasks}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Member: mark all done */}
                    {!isViewer && !task.member_done && task.status !== 'done' && (
                      <Button variant="ghost" size="sm" onClick={() => markMemberDone(task.id)} className="text-xs">
                        {t('markDone')}
                      </Button>
                    )}
                    {/* Viewer: confirm done */}
                    {isViewer && task.member_done && task.status !== 'done' && (
                      <Button variant="ghost" size="sm" onClick={() => confirmDone(task.id)} className="text-xs text-green-600 hover:text-green-700">
                        {t('confirmDone')}
                      </Button>
                    )}
                    {isViewer && (
                      <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)} className="text-slate-400 hover:text-red-500 h-8 w-8">
                        <Trash2 size={14} />
                      </Button>
                    )}
                    {totalSubtasks > 0 && (
                      <Button variant="ghost" size="icon" onClick={() => toggleExpand(task.id)} className="h-8 w-8">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Subtasks */}
                {isExpanded && task.subtasks && task.subtasks.length > 0 && (
                  <div className="mt-3 space-y-1.5 pl-4 border-l border-slate-200 dark:border-slate-700">
                    {task.subtasks.map(sub => {
                      const canToggle = !isViewer && task.status !== 'done'
                      return (
                        <div key={sub.id} className="flex items-center gap-2">
                          <button
                            disabled={!canToggle}
                            onClick={() => canToggle && toggleSubtask(task.id, sub.id, !sub.done)}
                            className="text-slate-400 hover:text-green-600 dark:hover:text-green-400 disabled:cursor-default"
                          >
                            {sub.done
                              ? <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                              : <Circle size={16} />
                            }
                          </button>
                          <span className={`text-sm ${sub.done ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {sub.title}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Done tasks (collapsed) */}
      {doneTasks.length > 0 && (
        <details className="group">
          <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 select-none">
            <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
            {t('doneTasks')} ({doneTasks.length})
          </summary>
          <div className="mt-2 space-y-2 opacity-60">
            {doneTasks.map(task => (
              <Card key={task.id}>
                <CardContent className="pt-3 pb-3">
                  <span className="text-sm line-through text-slate-400">{task.title}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}

      {!loading && tasks.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">{t('noTasks')}</p>
      )}
    </div>
  )
}
