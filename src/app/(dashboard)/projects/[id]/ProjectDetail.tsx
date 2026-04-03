'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { toast } from 'sonner'
import { UserPlus, Users, CalendarRange, Clock, ClipboardList } from 'lucide-react'
import { format } from 'date-fns'

// Generate a deterministic colour for an initial avatar based on name
const AVATAR_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
]

function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

interface Props {
  project: any
  overtimeRequests: any[]
  allUsers: any[]
  currentUser: any
  canManageMembers: boolean
}

export function ProjectDetail({ project, overtimeRequests, allUsers, currentUser, canManageMembers }: Props) {
  const router = useRouter()
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAddMember = async () => {
    if (!selectedUserId) { toast.error('請選擇成員'); return }
    setLoading(true)
    const res = await fetch(`/api/projects/${project.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: selectedUserId }),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success('成員已加入')
    setAddMemberOpen(false)
    setSelectedUserId('')
    router.refresh()
  }

  const projectStatus = project.is_active ? 'in_progress' : 'done'

  // Members (deduplicated: owner first, then rest)
  const memberList: any[] = project.members ?? []

  // Existing member user IDs for filtering the add-member dropdown
  const existingMemberIds = new Set(memberList.map((m: any) => m.user_id))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Main column ── */}
      <div className="lg:col-span-2 space-y-6">

        {/* Project header card */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 font-[Lexend]">
                {project.name}
              </h2>
              {project.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400">{project.description}</p>
              )}
            </div>
            <StatusBadge status={projectStatus} />
          </div>

          {/* Date range */}
          {(project.start_date || project.end_date) && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <CalendarRange size={14} className="text-orange-500 shrink-0" aria-hidden />
              <span>
                {project.start_date ?? '—'} ～ {project.end_date ?? '進行中'}
              </span>
            </div>
          )}

          {/* Project lead */}
          <div className="flex items-center gap-2 text-sm">
            <Clock size={14} className="text-slate-400 shrink-0" aria-hidden />
            <span className="text-slate-400">負責人</span>
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              {project.owner?.display_name ?? '—'}
            </span>
          </div>
        </div>

        {/* Overtime records */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <ClipboardList size={15} className="text-orange-500" aria-hidden />
              加班記錄
            </h3>
            <Badge variant="outline" className="text-xs text-slate-500">
              共 {overtimeRequests.length} 筆
            </Badge>
          </div>

          {overtimeRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ClipboardList size={32} className="text-slate-200 dark:text-slate-600 mb-3" aria-hidden />
              <p className="text-sm text-slate-400">此專案尚無加班紀錄</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left text-slate-400 font-medium text-xs pb-2 pr-4 whitespace-nowrap">日期</th>
                    <th className="text-left text-slate-400 font-medium text-xs pb-2 pr-4 whitespace-nowrap">申請人</th>
                    <th className="text-left text-slate-400 font-medium text-xs pb-2 pr-4 whitespace-nowrap">時段</th>
                    <th className="text-left text-slate-400 font-medium text-xs pb-2 pr-4 whitespace-nowrap">時數</th>
                    <th className="text-left text-slate-400 font-medium text-xs pb-2 whitespace-nowrap">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {overtimeRequests.map((req: any) => (
                    <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {req.date}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300">
                        {req.user?.display_name ?? '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500 whitespace-nowrap">
                        {req.start_time && req.end_time
                          ? `${req.start_time} – ${req.end_time}`
                          : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300 tabular-nums">
                        {req.hours != null ? `${req.hours} h` : '—'}
                      </td>
                      <td className="py-2.5">
                        <StatusBadge status={req.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar: Members ── */}
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Users size={14} aria-hidden />
              成員（{memberList.length}）
            </h3>
            {canManageMembers && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[36px] text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors duration-150"
                onClick={() => setAddMemberOpen(true)}
                aria-label="新增成員"
              >
                <UserPlus size={14} className="mr-1" aria-hidden />
                新增
              </Button>
            )}
          </div>

          {memberList.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">尚無成員</p>
          ) : (
            <div className="space-y-2">
              {memberList.map((m: any) => {
                const name = m.user?.display_name ?? '未知'
                const color = avatarColor(name)
                return (
                  <div key={m.user_id} className="flex items-center gap-2.5">
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold shrink-0 ${color}`}
                      aria-hidden
                    >
                      {initials(name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{name}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs shrink-0 ${
                        m.role === 'lead'
                          ? 'border-orange-200 text-orange-700 dark:border-orange-800 dark:text-orange-300'
                          : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      {m.role === 'lead' ? '負責人' : '成員'}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Add Member Dialog ── */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增專案成員</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <label htmlFor="add-member-select" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                選擇人員 <span className="text-red-500" aria-hidden>*</span>
              </label>
              <Select value={selectedUserId} onValueChange={(v) => setSelectedUserId(v ?? '')}>
                <SelectTrigger id="add-member-select" className="mt-1">
                  <SelectValue placeholder="請選擇成員" />
                </SelectTrigger>
                <SelectContent>
                  {allUsers
                    .filter((u: any) => !existingMemberIds.has(u.id))
                    .map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.display_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button
              className="min-h-[44px] bg-orange-600 hover:bg-orange-700 text-white transition-colors duration-150"
              onClick={handleAddMember}
              disabled={loading}
            >
              {loading ? '新增中...' : '確認新增'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
