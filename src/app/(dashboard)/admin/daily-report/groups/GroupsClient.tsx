'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { DrGroup, DrGroupMember } from '@/lib/daily-report/types'

export type GroupWithMembers = DrGroup & {
  members: (DrGroupMember & { user: { id: string; display_name: string | null; email: string } | null })[]
}

interface Props {
  initialGroups: GroupWithMembers[]
  allUsers: { id: string; display_name: string | null; email: string }[]
}

interface MemberInput {
  user_id: string
  role: 'member' | 'viewer'
}

const emptyForm = { name: '', description: '', members: [] as MemberInput[] }

export function GroupsClient({ initialGroups, allUsers }: Props) {
  const t = useTranslations('dailyReport')
  const [groups, setGroups] = useState(initialGroups)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (g: GroupWithMembers) => {
    setEditingId(g.id)
    setForm({
      name: g.name,
      description: g.description ?? '',
      members: g.members.map(m => ({ user_id: m.user_id, role: m.role })),
    })
    setShowForm(true)
  }

  const addMember = (userId: string, role: 'member' | 'viewer' = 'member') => {
    if (form.members.some(m => m.user_id === userId)) return
    setForm(prev => ({ ...prev, members: [...prev.members, { user_id: userId, role }] }))
  }

  const removeMember = (userId: string) =>
    setForm(prev => ({ ...prev, members: prev.members.filter(m => m.user_id !== userId) }))

  const toggleMemberRole = (userId: string) =>
    setForm(prev => ({
      ...prev,
      members: prev.members.map(m =>
        m.user_id === userId ? { ...m, role: m.role === 'member' ? 'viewer' : 'member' } : m
      ),
    }))

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        const res = await fetch(`/api/admin/daily-report/groups/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, description: form.description, members: form.members }),
        })
        if (!res.ok) throw new Error()
        const updated = await fetch('/api/admin/daily-report/groups').then(r => r.json())
        setGroups(updated.data ?? [])
      } else {
        const res = await fetch('/api/admin/daily-report/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, description: form.description, members: form.members }),
        })
        if (!res.ok) throw new Error()
        const updated = await fetch('/api/admin/daily-report/groups').then(r => r.json())
        setGroups(updated.data ?? [])
      }
      setShowForm(false)
      setForm(emptyForm)
      toast.success(t('saved'))
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const deleteGroup = async (id: string) => {
    if (!confirm(t('confirmDeleteGroup'))) return
    await fetch(`/api/admin/daily-report/groups/${id}`, { method: 'DELETE' })
    setGroups(prev => prev.filter(g => g.id !== id))
    toast.success(t('deleted'))
  }

  const getUserName = (id: string) => {
    const u = allUsers.find(u => u.id === id)
    return u?.display_name ?? u?.email ?? id
  }

  const availableUsers = allUsers.filter(u => !form.members.some(m => m.user_id === u.id))

  return (
    <div className="space-y-4 pb-8">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus size={14} className="mr-1" />{t('newGroup')}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{editingId ? t('editGroup') : t('newGroup')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('groupName')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('groupNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('groupDescription')}</label>
              <Input
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('groupDescriptionPlaceholder')}
              />
            </div>

            {/* Members */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('groupMembers')}</label>
              <p className="text-xs text-slate-400">{t('groupMembersHint')}</p>

              {/* Current members */}
              {form.members.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.members.map(m => (
                    <div key={m.user_id} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg px-2 py-1">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{getUserName(m.user_id)}</span>
                      <button
                        onClick={() => toggleMemberRole(m.user_id)}
                        className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                          m.role === 'viewer'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {m.role === 'viewer' ? t('roleViewer') : t('roleMember')}
                      </button>
                      <button onClick={() => removeMember(m.user_id)} className="text-slate-400 hover:text-red-500 ml-1">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add member */}
              {availableUsers.length > 0 && (
                <select
                  onChange={e => { if (e.target.value) { addMember(e.target.value); e.target.value = '' } }}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                  defaultValue=""
                >
                  <option value="" disabled>{t('addMember')}</option>
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.display_name ?? u.email}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? t('saving') : t('save')}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm) }}>
                {t('cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups list */}
      {groups.length === 0 && !showForm && (
        <p className="text-sm text-slate-400 text-center py-8">{t('noGroups')}</p>
      )}

      {groups.map(group => {
        const memberCount = group.members.filter(m => m.role === 'member').length
        const viewerCount = group.members.filter(m => m.role === 'viewer').length
        return (
          <Card key={group.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">{group.name}</span>
                  </div>
                  {group.description && (
                    <p className="text-sm text-slate-400 mt-1 ml-6">{group.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2 ml-6">
                    {group.members.map(m => (
                      <Badge
                        key={m.user_id}
                        variant="outline"
                        className={`text-xs ${
                          m.role === 'viewer'
                            ? 'border-blue-200 text-blue-700 dark:border-blue-700 dark:text-blue-300'
                            : ''
                        }`}
                      >
                        {m.user?.display_name ?? m.user?.email ?? m.user_id}
                        {m.role === 'viewer' && ` (${t('roleViewer')})`}
                      </Badge>
                    ))}
                    {group.members.length === 0 && (
                      <span className="text-xs text-slate-400">{t('noMembersYet')}</span>
                    )}
                  </div>
                  <div className="mt-1 ml-6 text-xs text-slate-400">
                    {memberCount} {t('roleMember')} · {viewerCount} {t('roleViewer')}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(group)} className="h-8 w-8">
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteGroup(group.id)} className="h-8 w-8 text-slate-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
