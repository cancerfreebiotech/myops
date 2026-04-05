'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/StatusBadge'
import { toast } from 'sonner'
import { Plus, FileText } from 'lucide-react'

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
  const t = useTranslations('payroll')
  const tc = useTranslations('common')

  const FLOW_ACTIONS: Record<string, { label: string; next: string }> = {
    draft:             { label: t('hrReview'), next: 'hr_review' },
    hr_reviewed:       { label: t('financeConfirm'), next: 'finance_confirm' },
    finance_confirmed: { label: t('cooApprove'), next: 'coo_approve' },
    coo_approved:      { label: t('confirmPay'), next: 'pay' },
  }

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
    if (!selUser || !baseSalary) { toast.error(t('employeeAndBase')); return }
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
    toast.success(t('recordCreated'))
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
    toast.success(t('statusUpdated'))
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
          ...(canViewPayroll ? [{ key: 'records', label: t('payrollTableWithDate', { year: currentYear, month: currentMonth }) }] : []),
          { key: 'payslips', label: t('myPayslips') },
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
                <Plus size={15} className="mr-1.5" /> {t('createRecord')}
              </Button>
            </div>
          )}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('employee')}</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('baseSalary')}</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('overtimePay')}</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('deductions')}</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('netPay')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{tc('status')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {records.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">{t('noRecordsMonth')}</td></tr>
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
            <p className="text-center py-8 text-slate-400 text-sm">{t('noPayslips')}</p>
          ) : myPayslips.map((r: any) => (
            <div key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-blue-500" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {t('payslipTitle', { year: r.year, month: r.month })}
                  </span>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">{t('baseSalary')}</p>
                  <p className="font-medium tabular-nums text-slate-700 dark:text-slate-300">{formatCurrency(r.base_salary)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">{t('overtimePay')}</p>
                  <p className="font-medium tabular-nums text-slate-700 dark:text-slate-300">{formatCurrency(r.overtime_pay)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">{t('deductions')}</p>
                  <p className="font-medium tabular-nums text-red-500">{formatCurrency(r.deductions)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">{t('netPay')}</p>
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
          <DialogHeader><DialogTitle>{t('createTitle', { year: currentYear, month: currentMonth })}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('employee')}</label>
              <Select value={selUser} onValueChange={v => setSelUser(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t('selectEmployee')} /></SelectTrigger>
                <SelectContent>
                  {allUsers.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('baseSalaryNT')}</label>
                <Input type="number" value={baseSalary} onChange={e => setBaseSalary(e.target.value)} className="mt-1" min="0" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('overtimePayNT')}</label>
                <Input type="number" value={otPay} onChange={e => setOtPay(e.target.value)} className="mt-1" min="0" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('bonusNT')}</label>
                <Input type="number" value={bonus} onChange={e => setBonus(e.target.value)} className="mt-1" min="0" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('deductionsNT')}</label>
                <Input type="number" value={deductions} onChange={e => setDeductions(e.target.value)} className="mt-1" min="0" />
              </div>
            </div>
            {baseSalary && (
              <p className="text-sm text-blue-600">
                {t('netPayEstimate', { amount: ((parseFloat(baseSalary || '0') + parseFloat(otPay || '0') + parseFloat(bonus || '0')) - parseFloat(deductions || '0')).toLocaleString() })}
              </p>
            )}
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('notes')}</label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleCreate} disabled={loading}>{loading ? tc('creating') : tc('create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
