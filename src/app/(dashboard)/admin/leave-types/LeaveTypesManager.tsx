'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'

const APPLIES_TO_LABELS: Record<string, string> = {
  all: '全員', full_time: '正職', intern: '實習生',
}
const PAY_RATE_LABELS: Record<string, string> = {
  full: '全薪', half: '半薪', none: '無薪',
}

const EMPTY_FORM = {
  name: '', applies_to: 'full_time', pay_rate: 'full',
  max_days_per_year: '', advance_days_required: '1', is_active: true,
}

export function LeaveTypesManager({ leaveTypes }: { leaveTypes: any[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  const openEdit = (lt: any) => {
    setEditing(lt)
    setForm({
      name: lt.name,
      applies_to: lt.applies_to,
      pay_rate: lt.pay_rate,
      max_days_per_year: lt.max_days_per_year ?? '',
      advance_days_required: lt.advance_days_required ?? '1',
      is_active: lt.is_active ?? true,
    })
    setOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('請填寫假別名稱'); return }
    setLoading(true)
    const payload = {
      ...form,
      max_days_per_year: form.max_days_per_year ? parseInt(form.max_days_per_year as string) : null,
      advance_days_required: parseInt(form.advance_days_required as string),
    }
    const url = editing ? `/api/admin/leave-types/${editing.id}` : '/api/admin/leave-types'
    const method = editing ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success(editing ? '假別已更新' : '假別已新增')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate} className="min-h-[44px]">
          <Plus size={16} className="mr-1" /> 新增假別
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">假別名稱</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">適用對象</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">薪資</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">年上限</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">提前天數</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">狀態</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {leaveTypes.map(lt => (
              <tr key={lt.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{lt.name}</td>
                <td className="px-4 py-3 text-slate-500">{APPLIES_TO_LABELS[lt.applies_to] ?? lt.applies_to}</td>
                <td className="px-4 py-3 text-slate-500">{PAY_RATE_LABELS[lt.pay_rate] ?? lt.pay_rate}</td>
                <td className="px-4 py-3 text-slate-500">{lt.max_days_per_year ?? '無上限'}</td>
                <td className="px-4 py-3 text-slate-500">{lt.advance_days_required} 天</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={lt.is_active ? 'border-green-300 text-green-700' : 'border-slate-300 text-slate-500'}>
                    {lt.is_active ? '啟用' : '停用'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(lt)}>
                    <Pencil size={13} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? '編輯假別' : '新增假別'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">假別名稱</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">適用對象</label>
                <Select value={form.applies_to} onValueChange={v => setForm(f => ({ ...f, applies_to: v ?? f.applies_to }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPLIES_TO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">薪資計算</label>
                <Select value={form.pay_rate} onValueChange={v => setForm(f => ({ ...f, pay_rate: v ?? f.pay_rate }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAY_RATE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">年上限（天，空白=無上限）</label>
                <Input type="number" value={form.max_days_per_year} onChange={e => setForm(f => ({ ...f, max_days_per_year: e.target.value }))} className="mt-1" min="0" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">需提前申請（天）</label>
                <Input type="number" value={form.advance_days_required} onChange={e => setForm(f => ({ ...f, advance_days_required: e.target.value }))} className="mt-1" min="0" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                className="accent-blue-600"
              />
              <label htmlFor="is_active" className="text-sm text-slate-700 dark:text-slate-300">啟用此假別</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? '儲存中...' : '儲存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
