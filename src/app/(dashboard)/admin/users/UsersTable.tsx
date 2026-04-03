'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserEditForm } from './UserEditForm'
import { Search, Pencil, FileUser, UserX, AlertTriangle, Loader2 } from 'lucide-react'
import { DialogFooter } from '@/components/ui/dialog'
import Link from 'next/link'

interface UsersTableProps {
  users: any[]
  departments: any[]
}

export function UsersTable({ users, departments }: UsersTableProps) {
  const [search, setSearch] = useState('')
  const [editUser, setEditUser] = useState<any>(null)
  const [offboardUser, setOffboardUser] = useState<any>(null)
  const [offboardData, setOffboardData] = useState<any>(null)
  const [offboardLoading, setOffboardLoading] = useState(false)

  const handleOffboard = async (user: any) => {
    setOffboardUser(user)
    setOffboardLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/offboarding`)
      if (res.ok) {
        const json = await res.json()
        setOffboardData(json.data)
      }
    } catch { /* ignore */ }
    setOffboardLoading(false)
  }

  const filtered = users.filter(u =>
    u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.department?.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="搜尋姓名、Email、部門..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800">
              <TableHead>姓名</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>部門</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>類型</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-400 py-8">無資料</TableCell>
              </TableRow>
            ) : filtered.map(user => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.display_name ?? '—'}</TableCell>
                <TableCell className="text-slate-500 text-sm">{user.email}</TableCell>
                <TableCell>{user.department?.name ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role === 'admin' ? 'Admin' : '一般'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {user.employment_type === 'full_time' ? '正職' : '實習'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.is_active ? 'default' : 'destructive'} className={user.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : ''}>
                    {user.is_active ? '在職' : '離職'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditUser(user)} className="min-w-[44px] min-h-[44px]" aria-label="編輯">
                      <Pencil size={15} />
                    </Button>
                    <Link href={`/admin/users/${user.id}/profile`}>
                      <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" aria-label="人事資料">
                        <FileUser size={15} />
                      </Button>
                    </Link>
                    {user.is_active && (
                      <Button variant="ghost" size="icon" onClick={() => handleOffboard(user)} className="min-w-[44px] min-h-[44px] text-red-500 hover:text-red-700" aria-label="離職交接">
                        <UserX size={15} />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editUser} onOpenChange={open => !open && setEditUser(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯使用者</DialogTitle>
          </DialogHeader>
          {editUser && (
            <UserEditForm
              user={editUser}
              departments={departments}
              allUsers={users}
              onClose={() => setEditUser(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Offboarding dialog */}
      <Dialog open={!!offboardUser} onOpenChange={open => { if (!open) { setOffboardUser(null); setOffboardData(null) } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-500" />
              離職交接檢查 — {offboardUser?.display_name}
            </DialogTitle>
          </DialogHeader>
          {offboardLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : offboardData ? (
            <div className="space-y-3 text-sm">
              <OffboardSection label="名下合約" items={offboardData.contracts} renderItem={(c: any) => `${c.title} (${c.status})`} />
              <OffboardSection label="負責專案" items={offboardData.projects} renderItem={(p: any) => p.name} />
              <OffboardSection label="待審請假" items={offboardData.pendingLeaves} renderItem={(l: any) => `${l.start_date} ~ ${l.end_date}`} />
              <OffboardSection label="待審加班" items={offboardData.pendingOT} renderItem={(o: any) => `${o.ot_date} ${o.hours}h`} />
              <OffboardSection label="未發薪資" items={offboardData.unpaidPayroll} renderItem={(p: any) => `${p.year}/${p.month} (${p.status})`} />

              {(offboardData.contracts.length + offboardData.projects.length + offboardData.pendingLeaves.length + offboardData.pendingOT.length + offboardData.unpaidPayroll.length) > 0 ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3">
                  <p className="text-xs text-orange-700 dark:text-orange-400">
                    確認後將停用帳號，以上項目請先完成交接。
                  </p>
                </div>
              ) : (
                <p className="text-green-600 text-sm font-medium">此員工無待處理項目，可安全停用帳號。</p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOffboardUser(null); setOffboardData(null) }}>關閉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function OffboardSection({ label, items, renderItem }: { label: string; items: any[]; renderItem: (item: any) => string }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="font-medium text-slate-700 dark:text-slate-300">
        {label} <span className="text-red-500 tabular-nums">({items.length})</span>
      </p>
      <ul className="mt-1 space-y-0.5 pl-4 text-slate-500 dark:text-slate-400">
        {items.map((item, i) => (
          <li key={i} className="text-xs list-disc">{renderItem(item)}</li>
        ))}
      </ul>
    </div>
  )
}
