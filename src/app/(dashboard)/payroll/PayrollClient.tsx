'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/StatusBadge'
import { toast } from 'sonner'
import { Plus, FileText } from 'lucide-react'

const FLOW_ACTIONS: Record<string, { label: string; next: string }> = {
  draft:             { label: 'HR 審核', next: 'hr_review' },
  hr_reviewed:       { label: '財務確認', next: 'finance_confirm' },
  finance_confirmed: { label: '營運長核准', next: 'coo_approve' },
  coo_approved:      { label: '確認發薪', next: 'pay' },
}

interface Props {
  currentUser: any
  payrollRecords: any[]
  myPayslips: any[]
  allUsers: any[]
  isHR: boolean
  canViewPayroll: boolean
  canConfirmPayroll: boolean
  canApprovePayroll: boolean
  currentYear: number
  currentMonth: number
}

export function PayrollClient({
  currentUser, payrollRecords, myPayslips, allUsers,
  isHR, canViewPayroll, canConfirmPayroll, canApprovePayroll,
  currentYear, currentMonth,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'records' | 'payslips' | 'create'>(canViewPayroll ? 'records' : 'payslips')
  const [records, setRecords] = useState(payrollRecords)
  const [loading, setLoading] = useState(false)

  // Create form
  const [createOpen, setCreateOpen] = useState(false)
  const [selUser, setSelUser] = useState('')
  const [baseSalary, setBaseSalary] = useState('')
  const [otPay, setOtPay] = useState('')
  const [bonus, setBonus] = useState('')
  const [deductions, setDeductions] = useState('')
  const [notes, setNotes] = useState('')

  const handleCreate = async () => {
    if (!selUser || !baseSalary) { toast.error('請填寫員工與底薪'); return }
    setLoading(true)
    const res = await fetch('/api/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: selUser,
        year: currentYear,
        month: currentMonth,
        base_salary: parseFloat(baseSalary),
        overtime_pay: parseFloat(otPay || '0'),
        bonus: parseFloat(bonus || '0'),
        deductions: parseFloat(deductions || '0'),
        notes,
      }),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success('薪資紀錄已建立')
    setCreateOpen(false)
    router.refresh()
  }

  const handleAction = async (id: string, action: string) => {
    const res = await fetch(`/api/payroll/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const { error } = await res.json()
    if (error) { toast.error(error); return }
    toast.success('狀態已更新')
    router.refresh()
  }

  const canAct = (status: string) => {
    if (status === 'draft' && isHR) return true
    if (status === 'hr_reviewed' && canConfirmPayroll) return true
    if (status === 'finance_confirmed' && canApprovePayroll) return true
    if (status === 'coo_approved' && currentUser?.role === 'admin') return true
    return false
  }

  const formatCurrency = (n: number | null) =>
    n == null ? '—' : `NT$ ${Number(n).toLocaleString('zh-TW')}`

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {[
          ...(canViewPayroll ? [{ key: 'records', label: `${currentYear}/${currentMonth} 薪資表` }] : []),
          { key: 'payslips', label: '我的薪資單' },
        ].map((t: any) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'records' && canViewPayroll && (
        <>
          {isHR && (
            <div className="flex justify-end">
              <Button onClick={() => setCreateOpen(true)} className="min-h-[44px]">
                <Plus size={15} className="mr-1.5" /> 建立薪資紀錄
              </Button>
            </div>
          )}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">員工</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">底薪</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">加班費</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">扣除</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">實發</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">狀態</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {records.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">本月尚無薪資紀錄</td></tr>
                ) : records.map((r: any) => (
                  <tr key={r.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{r.user?.display_name}</p>
                      <p className="text-xs text-slate-400">{r.user?.department?.name}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(r.base_salary)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(r.overtime_pay)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-500">{formatCurrency(r.deductions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800 dark:text-slate-200">{formatCurrency(r.net_salary)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      {canAct(r.status) && FLOW_ACTIONS[r.status] && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-[32px] text-xs"
                          onClick={() => handleAction(r.id, FLOW_ACTIONS[r.status].next)}
                        >
                          {FLOW_ACTIONS[r.status].label}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'payslips' && (
        <div className="space-y-3">
          {myPayslips.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm">無薪資單</p>
          ) : myPayslips.map((r: any) => (
            <div key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-blue-500" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {r.year} 年 {r.month} 月薪資單
                  </span>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">底薪</p>
                  <p className="font-medium tabular-nums text-slate-700 dark:text-slate-300">{formatCurrency(r.base_salary)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">加班費</p>
                  <p className="font-medium tabular-nums text-slate-700 dark:text-slate-300">{formatCurrency(r.overtime_pay)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">扣除項</p>
                  <p className="font-medium tabular-nums text-red-500">{formatCurrency(r.deductions)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">實發</p>
                  <p className="font-bold tabular-nums text-blue-600 dark:text-blue-400">{formatCurrency(r.net_salary)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>建立薪資紀錄 ({currentYear}/{currentMonth})</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">員工</label>
              <Select value={selUser} onValueChange={v => setSelUser(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="選擇員工" /></SelectTrigger>
                <SelectContent>
                  {allUsers.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">底薪 (NT$)</label>
                <Input type="number" value={baseSalary} onChange={e => setBaseSalary(e.target.value)} className="mt-1" min="0" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">加班費 (NT$)</label>
                <Input type="number" value={otPay} onChange={e => setOtPay(e.target.value)} className="mt-1" min="0" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">獎金 (NT$)</label>
                <Input type="number" value={bonus} onChange={e => setBonus(e.target.value)} className="mt-1" min="0" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">扣除項 (NT$)</label>
                <Input type="number" value={deductions} onChange={e => setDeductions(e.target.value)} className="mt-1" min="0" />
              </div>
            </div>
            {baseSalary && (
              <p className="text-sm text-blue-600">
                實發：NT$ {((parseFloat(baseSalary || '0') + parseFloat(otPay || '0') + parseFloat(bonus || '0')) - parseFloat(deductions || '0')).toLocaleString()}
              </p>
            )}
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">備註</label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={loading}>{loading ? '建立中...' : '建立'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
