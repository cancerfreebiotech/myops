'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Trash2, Gift } from 'lucide-react'

const BONUS_TYPES: Record<string, string> = {
  year_end: '年終獎金',
  performance: '績效獎金',
  project: '專案獎金',
  other: '其他',
}

interface Props {
  initialBonuses: any[]
  allUsers: any[]
  currentYear: number
}

export function BonusClient({ initialBonuses, allUsers, currentYear }: Props) {
  const router = useRouter()
  const [bonuses, setBonuses] = useState(initialBonuses)
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(false)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [selUser, setSelUser] = useState('')
  const [bonusType, setBonusType] = useState('')
  const [month, setMonth] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  // Delete dialog
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const formatCurrency = (n: number | null) =>
    n == null ? '—' : `NT$ ${Number(n).toLocaleString('zh-TW')}`

  const fetchBonuses = async (y: number) => {
    const res = await fetch(`/api/admin/bonuses?year=${y}`)
    if (res.ok) {
      const json = await res.json()
      setBonuses(json.data ?? [])
    }
  }

  const handleYearChange = async (y: number) => {
    setYear(y)
    await fetchBonuses(y)
  }

  const handleCreate = async () => {
    if (!selUser || !bonusType || !amount) {
      toast.error('請填寫員工、類型與金額')
      return
    }
    setLoading(true)
    const res = await fetch('/api/admin/bonuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: selUser,
        year,
        month: month || null,
        type: bonusType,
        amount: parseFloat(amount),
        description: description || null,
      }),
    })
    const json = await res.json()
    setLoading(false)
    if (json.error) { toast.error(json.error); return }
    toast.success('獎金紀錄已建立')
    setCreateOpen(false)
    setSelUser('')
    setBonusType('')
    setMonth('')
    setAmount('')
    setDescription('')
    await fetchBonuses(year)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const res = await fetch(`/api/admin/bonuses/${deleteId}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.error) { toast.error(json.error); return }
    toast.success('獎金紀錄已刪除')
    setDeleteId(null)
    await fetchBonuses(year)
  }

  const total = bonuses.reduce((sum: number, b: any) => sum + Number(b.amount ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label htmlFor="bonus-year" className="text-sm font-medium text-slate-600 dark:text-slate-400">年度</label>
          <select
            id="bonus-year"
            value={year}
            onChange={e => handleYearChange(Number(e.target.value))}
            className="h-9 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(y => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700">
          <Plus size={15} className="mr-1.5" /> 新增獎金
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">員工</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">月份</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">類型</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">金額</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">說明</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {bonuses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <Gift size={36} className="mx-auto text-slate-200 dark:text-slate-600 mb-3" />
                    <p className="text-sm text-slate-400">{year} 年尚無獎金紀錄</p>
                  </td>
                </tr>
              ) : (
                <>
                  {bonuses.map((b: any) => {
                    const u = Array.isArray(b.user) ? b.user[0] : b.user
                    return (
                      <tr key={b.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                          {u?.display_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {b.month ? `${b.month} 月` : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {BONUS_TYPES[b.type] ?? b.type}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(b.amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                          {b.description || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setDeleteId(b.id)}
                            aria-label="刪除獎金紀錄"
                            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-slate-50 dark:bg-slate-800/80">
                    <td colSpan={3} className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                      合計
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(total)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>新增獎金紀錄</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                員工 <span className="text-red-500">*</span>
              </label>
              <Select value={selUser} onValueChange={v => setSelUser(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="選擇員工" /></SelectTrigger>
                <SelectContent>
                  {allUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  類型 <span className="text-red-500">*</span>
                </label>
                <Select value={bonusType} onValueChange={v => setBonusType(v ?? '')}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="選擇類型" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BONUS_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">月份</label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                  placeholder="可選"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  金額 (NT$) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">說明</label>
              <Textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
              {loading ? '建立中...' : '建立'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>確認刪除</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-400">確定要刪除此筆獎金紀錄？此操作無法復原。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
