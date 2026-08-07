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
  // 時/分拆成兩個 24 小時制下拉（feedback 0f8d0d08）：原生 <input type="time"> 的
  // 顯示格式跟著瀏覽器/OS locale 走（en 環境會變 12 小時制 AM/PM），HTML 沒有
  // 強制 24h 的屬性，只能自訂控制項。
  const [hour, setHour] = useState('')
  const [minute, setMinute] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!date || !hour || !minute || !reason.trim()) {
      toast.error(t('requiredFields'))
      return
    }
    setLoading(true)
    const res = await fetch('/api/attendance/makeup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clock_date: date, clock_type: clockType, clock_time: `${date}T${hour}:${minute}:00+08:00`, reason }),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success(t('success'))
    onOpenChange(false)
    setDate(''); setHour(''); setMinute(''); setReason('')
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
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Select value={hour || null} onValueChange={v => setHour(v ?? '')}>
                <SelectTrigger aria-label={t('hour')}><SelectValue placeholder={t('hour')} /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={minute || null} onValueChange={v => setMinute(v ?? '')}>
                <SelectTrigger aria-label={t('minute')}><SelectValue placeholder={t('minute')} /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
