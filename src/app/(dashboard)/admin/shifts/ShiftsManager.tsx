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

interface Shift {
  id: string; name: string; start_time: string; end_time: string
  work_days: number[]; flex_minutes: number; break_minutes: number; is_active: boolean | null
}
interface UserRow { id: string; display_name: string | null; employment_type: string | null }

const DOW = [1, 2, 3, 4, 5, 6, 7] // ISO Mon..Sun

interface Form {
  name: string; start_time: string; end_time: string
  work_days: number[]; flex_minutes: string; break_minutes: string; is_active: boolean
}
const EMPTY: Form = {
  name: '', start_time: '09:00', end_time: '18:00',
  work_days: [1, 2, 3, 4, 5], flex_minutes: '0', break_minutes: '60', is_active: true,
}

export function ShiftsManager({ shifts, users, currentByUser }: {
  shifts: Shift[]; users: UserRow[]; currentByUser: Record<string, string>
}) {
  const router = useRouter()
  const t = useTranslations('admin.shifts')
  const tc = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Shift | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(false)

  const openCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true) }
  const openEdit = (s: Shift) => {
    setEditing(s)
    setForm({
      name: s.name, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5),
      work_days: s.work_days ?? [1, 2, 3, 4, 5],
      flex_minutes: String(s.flex_minutes ?? 0), break_minutes: String(s.break_minutes ?? 60),
      is_active: s.is_active ?? true,
    })
    setOpen(true)
  }

  const toggleDay = (d: number) =>
    setForm(f => ({ ...f, work_days: f.work_days.includes(d) ? f.work_days.filter(x => x !== d) : [...f.work_days, d].sort() }))

  const saveShift = async () => {
    if (!form.name.trim()) { toast.error(t('nameRequired')); return }
    setLoading(true)
    const payload = {
      name: form.name.trim(), start_time: form.start_time, end_time: form.end_time,
      work_days: form.work_days, flex_minutes: parseInt(form.flex_minutes || '0'),
      break_minutes: parseInt(form.break_minutes || '0'), is_active: form.is_active,
    }
    const url = editing ? `/api/admin/shifts/${editing.id}` : '/api/admin/shifts'
    const res = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success(tc('saved'))
    setOpen(false)
    router.refresh()
  }

  const assign = async (userId: string, shiftId: string) => {
    const res = await fetch('/api/admin/shifts/assign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, shift_id: shiftId }),
    })
    const { error } = await res.json()
    if (error) { toast.error(error); return }
    toast.success(tc('saved'))
    router.refresh()
  }

  return (
    <div className="space-y-8">
      {/* 班別列表 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">{t('shiftsTitle')}</h2>
          <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />{t('newShift')}</Button>
        </div>
        <div className="grid gap-2">
          {shifts.map(s => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{s.name}
                  {!s.is_active && <Badge className="ml-2" variant="secondary">{t('inactive')}</Badge>}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {t('flex')}: {s.flex_minutes}m · {t('break')}: {s.break_minutes}m
                  · {(s.work_days ?? []).map(d => t(`dow.${d}`)).join(' ')}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
            </div>
          ))}
          {shifts.length === 0 && <p className="text-sm text-slate-400">{t('noShifts')}</p>}
        </div>
      </section>

      {/* 員工指派 */}
      <section>
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">{t('assignTitle')}</h2>
        <div className="grid gap-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5">
              <span className="text-sm text-slate-900 dark:text-slate-100">{u.display_name ?? u.id}</span>
              <Select value={currentByUser[u.id] ?? ''} onValueChange={v => v && assign(u.id, v)}>
                <SelectTrigger className="w-56"><SelectValue placeholder={t('selectShift')} /></SelectTrigger>
                <SelectContent>
                  {shifts.filter(s => s.is_active).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </section>

      {/* 班別編輯 Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? t('editShift') : t('newShift')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-500">{t('name')}</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">{t('startTime')}</label>
                <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">{t('endTime')}</label>
                <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">{t('flexMinutes')}</label>
                <Input type="number" min="0" value={form.flex_minutes} onChange={e => setForm(f => ({ ...f, flex_minutes: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">{t('breakMinutes')}</label>
                <Input type="number" min="0" value={form.break_minutes} onChange={e => setForm(f => ({ ...f, break_minutes: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500">{t('workDays')}</label>
              <div className="flex gap-1 mt-1">
                {DOW.map(d => (
                  <button type="button" key={d} onClick={() => toggleDay(d)}
                    className={`w-9 h-9 rounded-md text-xs font-medium border ${form.work_days.includes(d)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-300 dark:border-slate-600 text-slate-500'}`}>
                    {t(`dow.${d}`)}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              {t('active')}
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={saveShift} disabled={loading}>{tc('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
