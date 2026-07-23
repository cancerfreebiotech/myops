'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface BalanceUser {
  id: string
  display_name: string | null
  employment_type: string
  department: { name: string } | { name: string }[] | null
}

interface LeaveType {
  id: string
  name: string
  applies_to: string
  // 主頁提供；hr-settings 唯讀預覽未帶（此時 fixed 假別不顯示 default fallback）
  default_quota_days?: number | null
}

interface LeaveBalance {
  user_id: string
  leave_type_id: string
  allocated_days: number | null
  // 主頁提供（供顯示已用天數 / 存回正確年度）；其他呼叫端可省略
  used_days?: number | null
  year?: number
}

interface Props {
  users: BalanceUser[]
  leaveTypes: LeaveType[]
  balances: LeaveBalance[]
  year: number
  readOnly?: boolean
}

export function LeaveBalancesManager({ users, leaveTypes, balances, year, readOnly }: Props) {
  const router = useRouter()
  const t = useTranslations('common')
  const tm = useTranslations('admin.leaveBalancesMgmt')
  const [filterUser, setFilterUser] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, number>>({})
  const [autoFilling, setAutoFilling] = useState(false)

  const filteredUsers = filterUser ? users.filter(u => u.id === filterUser) : users

  const getRow = (userId: string, typeId: string) =>
    balances.find(b => b.user_id === userId && b.leave_type_id === typeId) ?? null

  // 顯示用：edits 優先；否則有 balance 列 → 用其配額(total)＋已用；皆無 → fallback 該假別的
  // default_quota_days（isDefault：淡色/虛線，表「尚未實體化」，HR 編輯存檔後才建列並開始管控）。
  const getCell = (userId: string, typeId: string): { value: number; used: number; isDefault: boolean } => {
    const key = `${userId}_${typeId}`
    const row = getRow(userId, typeId)
    if (key in edits) return { value: edits[key], used: row?.used_days ?? 0, isDefault: false }
    if (row) return { value: row.allocated_days ?? 0, used: row.used_days ?? 0, isDefault: false }
    const dq = leaveTypes.find(lt => lt.id === typeId)?.default_quota_days
    return { value: dq ?? 0, used: 0, isDefault: dq != null }
  }

  const handleSave = async (userId: string, typeId: string) => {
    const key = `${userId}_${typeId}`
    const allocated = edits[key]
    if (allocated === undefined) return
    // 存回「被 pick 到那一列」的 year（例如 8–12 月到職者特休列 year=去年），
    // 否則會新建一筆當年空 period 的影子列被期間規則遮蔽；無列時 fallback 當年。
    const saveYear = getRow(userId, typeId)?.year ?? year
    setSaving(key)
    const res = await fetch('/api/admin/leave-balances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, leave_type_id: typeId, year: saveYear, allocated_days: allocated }),
    })
    const { error } = await res.json()
    setSaving(null)
    if (error) { toast.error(error); return }
    toast.success(t('success'))
    const rest = { ...edits }
    delete rest[key]
    setEdits(rest)
    router.refresh()
  }

  // 依年資自動帶入特休（週年制）— 不覆寫 HR 手動設定的餘額
  const handleAutoFill = async () => {
    setAutoFilling(true)
    const res = await fetch('/api/admin/leave-balances/auto-fill', { method: 'POST' })
    const { data, error } = await res.json()
    setAutoFilling(false)
    if (error) { toast.error(error); return }
    toast.success(tm('autoFillDone', {
      generated: data.generated,
      skipped: data.skippedManual,
      missing: data.missingHireDate,
    }))
    router.refresh()
  }

  const APPLIES_LABELS: Record<string, string> = { all: tm('appliesAll'), full_time: tm('fullTime'), intern: tm('intern') }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filterUser} onValueChange={v => setFilterUser(v ?? '')}>
          <SelectTrigger className="w-52"><SelectValue placeholder={tm('allEmployees')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{tm('allEmployees')}</SelectItem>
            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-400">{tm('yearLabel', { y: year })}</span>
        {!readOnly && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={handleAutoFill} disabled={autoFilling}>
            {autoFilling ? tm('autoFilling') : tm('autoFillSeniority')}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 sticky left-0 bg-slate-50 dark:bg-slate-800">{tm('employee')}</th>
              {leaveTypes.map(lt => (
                <th key={lt.id} className="text-center px-3 py-3 font-medium text-slate-600 dark:text-slate-400 min-w-[90px]">
                  <div>{lt.name}</div>
                  <div className="text-xs font-normal text-slate-400">{APPLIES_LABELS[lt.applies_to]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredUsers.map(u => (
              <tr key={u.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="px-4 py-2 sticky left-0 bg-white dark:bg-slate-800">
                  <p className="font-medium text-slate-800 dark:text-slate-200">{u.display_name}</p>
                  <p className="text-xs text-slate-400">{(Array.isArray(u.department) ? u.department[0] : u.department)?.name} · {u.employment_type === 'full_time' ? tm('fullTime') : tm('intern')}</p>
                </td>
                {leaveTypes.map(lt => {
                  const key = `${u.id}_${lt.id}`
                  const cell = getCell(u.id, lt.id)
                  const changed = key in edits
                  const isApplicable = lt.applies_to === 'all' ||
                    (lt.applies_to === 'full_time' && u.employment_type === 'full_time') ||
                    (lt.applies_to === 'intern' && u.employment_type === 'intern')
                  return (
                    <td key={lt.id} className="px-3 py-2 text-center">
                      {isApplicable ? (
                        readOnly ? (
                          <div className="text-sm text-slate-700 dark:text-slate-300">
                            <span className={cn(cell.isDefault && 'text-slate-400')}>{cell.value}</span>
                            {cell.used > 0 && <div className="text-[10px] text-slate-400">{tm('usedDays', { n: cell.used })}</div>}
                          </div>
                        ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1 justify-center">
                            <Input
                              type="number"
                              min="0"
                              max="365"
                              value={cell.value}
                              onChange={e => setEdits(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                              className={cn('w-16 text-center h-8 text-sm', cell.isDefault && 'text-slate-400 border-dashed')}
                            />
                            {changed && (
                              <Button size="sm" className="h-8 px-2 text-xs" onClick={() => handleSave(u.id, lt.id)} disabled={saving === key}>
                                {saving === key ? '...' : tm('saveShort')}
                              </Button>
                            )}
                          </div>
                          {cell.used > 0 && <span className="text-[10px] text-slate-400">{tm('usedDays', { n: cell.used })}</span>}
                        </div>
                        )
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
