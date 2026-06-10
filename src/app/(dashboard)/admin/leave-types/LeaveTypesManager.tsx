'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'

const APPLIES_TO_KEYS: Record<string, string> = {
  all: 'appliesToAll', full_time: 'appliesToFullTime', intern: 'appliesToIntern',
}
const PAY_RATE_KEYS: Record<string, string> = {
  full: 'payRateFull', half: 'payRateHalf', none: 'payRateNone',
}

const EMPTY_FORM = {
  name: '', applies_to: 'full_time', pay_rate: 'full',
  max_days_per_year: '', advance_days_required: '1', is_active: true,
}

export function LeaveTypesManager({ leaveTypes, readOnly }: { leaveTypes: any[]; readOnly?: boolean }) {
  const router = useRouter()
  const t = useTranslations('admin.leaveTypesMgmt')
  const tc = useTranslations('common')
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
    if (!form.name.trim()) { toast.error(t('nameRequired')); return }
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
    toast.success(editing ? t('updated') : t('created'))
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      {!readOnly && (
        <div className="flex justify-end mb-4">
          <Button onClick={openCreate} className="min-h-[44px]">
            <Plus size={16} className="mr-1" /> {t('addLeaveType')}
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('nameLabel')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('appliesToLabel')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('payHeader')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('maxPerYearHeader')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('advanceDaysHeader')}</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{tc('status')}</th>
              {!readOnly && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {leaveTypes.map(lt => (
              <tr key={lt.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{lt.name}</td>
                <td className="px-4 py-3 text-slate-500">{APPLIES_TO_KEYS[lt.applies_to] ? t(APPLIES_TO_KEYS[lt.applies_to]) : lt.applies_to}</td>
                <td className="px-4 py-3 text-slate-500">{PAY_RATE_KEYS[lt.pay_rate] ? t(PAY_RATE_KEYS[lt.pay_rate]) : lt.pay_rate}</td>
                <td className="px-4 py-3 text-slate-500">{lt.max_days_per_year ?? t('noLimit')}</td>
                <td className="px-4 py-3 text-slate-500">{t('daysCount', { d: lt.advance_days_required })}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={lt.is_active ? 'border-green-300 text-green-700' : 'border-slate-300 text-slate-500'}>
                    {lt.is_active ? tc('active') : tc('inactive')}
                  </Badge>
                </td>
                {!readOnly && (
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(lt)}>
                      <Pencil size={13} />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? t('editLeaveType') : t('addLeaveType')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('nameLabel')}</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('appliesToLabel')}</label>
                <Select value={form.applies_to} onValueChange={v => setForm(f => ({ ...f, applies_to: v ?? f.applies_to }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPLIES_TO_KEYS).map(([k, v]) => <SelectItem key={k} value={k}>{t(v)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('payRateCalcLabel')}</label>
                <Select value={form.pay_rate} onValueChange={v => setForm(f => ({ ...f, pay_rate: v ?? f.pay_rate }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAY_RATE_KEYS).map(([k, v]) => <SelectItem key={k} value={k}>{t(v)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('maxPerYearFieldLabel')}</label>
                <Input type="number" value={form.max_days_per_year} onChange={e => setForm(f => ({ ...f, max_days_per_year: e.target.value }))} className="mt-1" min="0" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('advanceFieldLabel')}</label>
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
              <label htmlFor="is_active" className="text-sm text-slate-700 dark:text-slate-300">{t('enableLabel')}</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? tc('saving') : tc('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
