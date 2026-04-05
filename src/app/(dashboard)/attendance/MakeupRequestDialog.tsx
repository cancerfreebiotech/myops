'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}

export function MakeupRequestDialog({ open, onOpenChange, onSuccess }: Props) {
  const t = useTranslations('attendance.makeup')
  const ta = useTranslations('attendance')
  const tc = useTranslations('common')
  const [date, setDate] = useState('')
  const [clockType, setClockType] = useState<'in' | 'out'>('in')
  const [time, setTime] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!date || !time || !reason.trim()) {
      toast.error(t('requiredFields'))
      return
    }
    setLoading(true)
    const res = await fetch('/api/attendance/makeup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clock_date: date, clock_type: clockType, clock_time: `${date}T${time}:00`, reason }),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success(t('success'))
    onOpenChange(false)
    setDate(''); setTime(''); setReason('')
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('title')}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('date')}</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('type')}</label>
            <Select value={clockType} onValueChange={v => setClockType((v ?? 'in') as 'in' | 'out')}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">{ta('clockIn')}</SelectItem>
                <SelectItem value="out">{ta('clockOut')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('time')}</label>
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('reason')}</label>
            <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} className="mt-1" placeholder={t('reasonPlaceholder')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? tc('submitting') : t('submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
