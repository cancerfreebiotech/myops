'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserEditForm } from './UserEditForm'
import { Search, Pencil } from 'lucide-react'

interface UsersTableProps {
  users: any[]
  departments: any[]
}

export function UsersTable({ users, departments }: UsersTableProps) {
  const [search, setSearch] = useState('')
  const [editUser, setEditUser] = useState<any>(null)

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
                  <Button variant="ghost" size="icon" onClick={() => setEditUser(user)} className="min-w-[44px] min-h-[44px]">
                    <Pencil size={15} />
                  </Button>
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
    </>
  )
}
