'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TrendingUp, Minus, DollarSign, ChevronDown } from 'lucide-react'

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

const statusConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  draft:             { bg: 'bg-slate-50',    text: 'text-slate-500',  border: 'border-slate-200', label: '草稿' },
  hr_reviewed:       { bg: 'bg-yellow-50',   text: 'text-yellow-800', border: 'border-yellow-200', label: 'HR 已審' },
  finance_confirmed: { bg: 'bg-blue-50',     text: 'text-blue-800',   border: 'border-blue-200',   label: '財務確認' },
  coo_approved:      { bg: 'bg-green-50',    text: 'text-green-800',  border: 'border-green-200',  label: '核准' },
  paid:              { bg: 'bg-emerald-50',  text: 'text-emerald-800', border: 'border-emerald-200', label: '已發薪' },
  rejected:          { bg: 'bg-red-50',      text: 'text-red-800',    border: 'border-red-200',    label: '退回' },
}

const formatCurrency = (n: number | null) =>
  n == null ? '—' : `NT$ ${Number(n).toLocaleString('zh-TW')}`

interface PayrollRecord {
  id: string
  user_id?: string
  year: number
  month: number
  base_salary: number | null
  overtime_pay: number | null
  bonus: number | null
  deductions: number | null
  net_salary: number | null
  status: string
}

interface User {
  id: string
  display_name: string
  department?: { name: string }
  employment_type?: string
}

interface Props {
  currentUser: any
  myAnnualRecords: PayrollRecord[]
  allUsers: User[]
  allAnnualRecords: PayrollRecord[]
  isHR: boolean
  canViewPayroll: boolean
  initialYear: number
  currentYear: number
}

export function AnnualPayrollClient({
  currentUser,
  myAnnualRecords,
  allUsers,
  allAnnualRecords,
  isHR,
  canViewPayroll,
  initialYear,
  currentYear,
}: Props) {
  const router = useRouter()
  const [selectedYear, setSelectedYear] = useState(initialYear)
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser?.id ?? '')

  const yearOptions = [
    currentYear - 2,
    currentYear - 1,
    currentYear,
    currentYear + 1,
    currentYear + 2,
  ]

  const handleYearChange = (val: string | null) => {
    if (!val) return
    const y = parseInt(val)
    setSelectedYear(y)
    router.push(`?year=${y}`)
  }

  // Determine which records to display
  const displayRecords = useMemo(() => {
    if (isHR && selectedUserId && selectedUserId !== currentUser?.id) {
      return allAnnualRecords.filter(r => r.user_id === selectedUserId)
    }
    return myAnnualRecords
  }, [isHR, selectedUserId, allAnnualRecords, myAnnualRecords, currentUser?.id])

  // Build month map
  const recordByMonth = useMemo(() => {
    const map: Record<number, PayrollRecord> = {}
    displayRecords.forEach(r => { map[r.month] = r })
    return map
  }, [displayRecords])

  // Totals
  const totals = useMemo(() => {
    let base = 0, ot = 0, bonus = 0, deductions = 0, net = 0
    let hasAny = false
    displayRecords.forEach(r => {
      hasAny = true
      base += r.base_salary ?? 0
      ot += r.overtime_pay ?? 0
      bonus += r.bonus ?? 0
      deductions += r.deductions ?? 0
      net += r.net_salary ?? 0
    })
    return { base, ot, bonus, deductions, net, hasAny }
  }, [displayRecords])

  const grossIncome = totals.base + totals.ot + totals.bonus

  const selectedUserName = isHR
    ? (allUsers.find(u => u.id === selectedUserId)?.display_name ?? currentUser?.display_name)
    : currentUser?.display_name

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Year selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="year-select" className="text-sm font-medium text-slate-600 dark:text-slate-400">
            年度
          </label>
          <Select value={String(selectedYear)} onValueChange={(v) => handleYearChange(v ?? '')}>
            <SelectTrigger id="year-select" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => (
                <SelectItem key={y} value={String(y)}>{y} 年</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Employee selector (HR only) */}
        {isHR && (
          <div className="flex items-center gap-2">
            <label htmlFor="user-select" className="text-sm font-medium text-slate-600 dark:text-slate-400">
              員工
            </label>
            <Select value={selectedUserId} onValueChange={(v) => setSelectedUserId(v ?? '')}>
              <SelectTrigger id="user-select" className="w-44">
                <SelectValue placeholder="選擇員工" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={currentUser?.id ?? ''}>
                  {currentUser?.display_name}（我）
                </SelectItem>
                {allUsers
                  .filter(u => u.id !== currentUser?.id)
                  .map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="ml-auto text-sm text-slate-500 dark:text-slate-400">
          {selectedYear} 年 · {selectedUserName}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={18} className="text-emerald-600" aria-hidden="true" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">全年總收入</span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300 font-[Lexend]">
            {totals.hasAny ? `NT$ ${grossIncome.toLocaleString('zh-TW')}` : '—'}
          </p>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-1">底薪 + 加班費 + 獎金</p>
        </div>

        <div className="rounded-xl border border-red-100 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Minus size={18} className="text-red-500" aria-hidden="true" />
            <span className="text-sm font-medium text-red-700 dark:text-red-400">全年扣除</span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400 font-[Lexend]">
            {totals.hasAny ? `NT$ ${totals.deductions.toLocaleString('zh-TW')}` : '—'}
          </p>
          <p className="text-xs text-red-600/70 dark:text-red-500 mt-1">健保、勞保、所得稅等</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-white dark:bg-slate-800 dark:border-emerald-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={18} className="text-emerald-600" aria-hidden="true" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">全年實發</span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 font-[Lexend]">
            {totals.hasAny ? `NT$ ${totals.net.toLocaleString('zh-TW')}` : '—'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">實際到帳金額合計</p>
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 font-[Lexend]">
            {selectedYear} 年逐月明細
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50">
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">月份</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">底薪</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">加班費</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">獎金</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">扣除</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">實發</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {MONTHS.map(month => {
                const r = recordByMonth[month]
                const isCurrentMonth = month === new Date().getMonth() + 1 && selectedYear === new Date().getFullYear()
                return (
                  <tr
                    key={month}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                      isCurrentMonth ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-white dark:bg-slate-800'
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {month} 月
                      {isCurrentMonth && (
                        <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400 font-normal">本月</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {r ? formatCurrency(r.base_salary) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {r ? formatCurrency(r.overtime_pay) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {r ? formatCurrency(r.bonus) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-500 whitespace-nowrap">
                      {r ? formatCurrency(r.deductions) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {r ? formatCurrency(r.net_salary) : <span className="text-slate-300 dark:text-slate-600 font-normal">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r ? (
                        <StatusBadge status={r.status} />
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="bg-emerald-50 dark:bg-emerald-950/30 border-t-2 border-emerald-200 dark:border-emerald-800">
                <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">全年合計</td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                  {totals.hasAny ? `NT$ ${totals.base.toLocaleString('zh-TW')}` : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                  {totals.hasAny ? `NT$ ${totals.ot.toLocaleString('zh-TW')}` : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                  {totals.hasAny ? `NT$ ${totals.bonus.toLocaleString('zh-TW')}` : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                  {totals.hasAny ? `NT$ ${totals.deductions.toLocaleString('zh-TW')}` : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                  {totals.hasAny ? `NT$ ${totals.net.toLocaleString('zh-TW')}` : '—'}
                </td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Empty state */}
        {!totals.hasAny && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <DollarSign size={40} className="text-slate-200 dark:text-slate-600 mb-3" aria-hidden="true" />
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              {selectedYear} 年尚無薪資紀錄
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
              薪資資料將在 HR 建立後顯示於此
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Inline StatusBadge for payroll statuses
function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? {
    bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', label: status,
  }
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}
