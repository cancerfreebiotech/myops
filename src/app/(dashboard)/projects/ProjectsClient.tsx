'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Plus, Users, Pencil } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  projects: any[]
  allUsers: any[]
  currentUser: any
  isAdmin: boolean
}

export function ProjectsClient({ projects, allUsers, currentUser, isAdmin }: Props) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ownerId, setOwnerId] = useState(currentUser?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [newMember, setNewMember] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('member')

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('請填寫專案名稱'); return }
    setLoading(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, owner_id: ownerId }),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success('專案已建立')
    setCreateOpen(false)
    setName(''); setDescription('')
    router.refresh()
  }

  const handleAddMember = async (projectId: string) => {
    if (!newMember) { toast.error('請選擇成員'); return }
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: newMember, role: newMemberRole }),
    })
    const { error } = await res.json()
    if (error) { toast.error(error); return }
    toast.success('成員已加入')
    setNewMember('')
    router.refresh()
  }

  const selectedProject = projects.find(p => p.id === membersOpen)

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setCreateOpen(true)} className="min-h-[44px]">
          <Plus size={16} className="mr-1.5" /> 建立專案
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-400">尚無專案</div>
        ) : projects.map(p => (
          <div key={p.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">{p.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">負責人：{p.owner?.display_name ?? '—'}</p>
              </div>
              <Badge variant="outline" className={`text-xs shrink-0 ${p.is_active ? 'border-green-200 text-green-700' : 'border-slate-200 text-slate-500'}`}>
                {p.is_active ? '進行中' : '已結案'}
              </Badge>
            </div>
            {p.description && (
              <p className="text-sm text-slate-500 mt-2 line-clamp-2">{p.description}</p>
            )}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setMembersOpen(p.id)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors"
              >
                <Users size={13} />
                <span>{p.members?.length ?? 0} 位成員</span>
              </button>
              <span className="text-xs text-slate-400">{format(new Date(p.created_at), 'yyyy/MM/dd')}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>建立專案</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">專案名稱 <span className="text-red-500">*</span></label>
              <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">說明</label>
              <Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} className="mt-1" />
            </div>
            {isAdmin && (
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">負責人</label>
                <Select value={ownerId} onValueChange={v => setOwnerId(v ?? currentUser?.id)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allUsers.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={loading}>{loading ? '建立中...' : '建立'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      <Dialog open={!!membersOpen} onOpenChange={() => setMembersOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedProject?.name} — 成員管理</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedProject?.members?.map((m: any) => (
                <div key={m.user_id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{m.user?.display_name}</span>
                  <Badge variant="outline" className="text-xs">{m.role === 'lead' ? '負責人' : '成員'}</Badge>
                </div>
              ))}
              {!selectedProject?.members?.length && <p className="text-slate-400 text-sm">尚無成員</p>}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <Select value={newMember} onValueChange={v => setNewMember(v ?? '')}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="選擇成員" /></SelectTrigger>
                <SelectContent>
                  {allUsers.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={newMemberRole} onValueChange={v => setNewMemberRole(v ?? 'member')}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">成員</SelectItem>
                  <SelectItem value="lead">負責人</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => handleAddMember(membersOpen!)} className="min-h-[36px]">加入</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
