'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/StatusBadge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Image as ImageIcon } from 'lucide-react'
import Image from 'next/image'

export function FeedbackAdmin({ feedbacks }: { feedbacks: any[] }) {
  const router = useRouter()
  const t = useTranslations('admin.feedbackAdmin')
  const tc = useTranslations('common')
  const TYPE_LABELS: Record<string, string> = {
    feature: t('types.feature'), bug: t('types.bug'), improvement: t('types.improvement'), other: t('types.other'),
  }
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = feedbacks.filter(f =>
    (!filterStatus || f.status === filterStatus) &&
    (!filterType || f.type === filterType)
  )

  const selected = feedbacks.find(f => f.id === selectedId)

  const handleStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/feedback/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const { error } = await res.json()
    if (error) { toast.error(error); return }
    toast.success(t('statusUpdated'))
    router.refresh()
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v ?? '')}>
          <SelectTrigger className="w-32"><SelectValue placeholder={t('allStatuses')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allStatuses')}</SelectItem>
            <SelectItem value="open">{tc('open')}</SelectItem>
            <SelectItem value="in_progress">{tc('in_progress')}</SelectItem>
            <SelectItem value="done">{tc('done')}</SelectItem>
            <SelectItem value="cancelled">{tc('cancelled')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={v => setFilterType(v ?? '')}>
          <SelectTrigger className="w-32"><SelectValue placeholder={t('allTypes')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allTypes')}</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-400 ml-auto">{t('countLabel', { count: filtered.length })}</span>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">{t('noRecords')}</div>
        ) : filtered.map(f => (
          <div key={f.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                    {TYPE_LABELS[f.type] ?? f.type}
                  </span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{f.title}</p>
                </div>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">{f.description}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                  <span>{f.user?.display_name}</span>
                  <span>{format(new Date(f.created_at), 'yyyy/MM/dd HH:mm')}</span>
                  {f.screenshot_url && <span className="flex items-center gap-0.5"><ImageIcon size={11} /> {t('hasScreenshot')}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <StatusBadge status={f.status} />
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setSelectedId(f.id)}>{tc('view')}</Button>
                  <Select value={f.status} onValueChange={v => v && handleStatus(f.id, v)}>
                    <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">{tc('open')}</SelectItem>
                      <SelectItem value="in_progress">{tc('in_progress')}</SelectItem>
                      <SelectItem value="done">{tc('done')}</SelectItem>
                      <SelectItem value="cancelled">{tc('cancelled')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        {selected && (
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{TYPE_LABELS[selected.type]}</span>
                <span>·</span>
                <span>{selected.user?.display_name}</span>
                <span>·</span>
                <span>{format(new Date(selected.created_at), 'yyyy/MM/dd HH:mm')}</span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{selected.description}</p>
              {selected.screenshot_url && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">{t('screenshot')}</p>
                  <div className="relative w-full aspect-video rounded-md border border-slate-200 overflow-hidden">
                    <Image
                      src={`/api/storage/download?bucket=feedback-screenshots&path=${encodeURIComponent(selected.screenshot_url)}`}
                      alt={t('screenshot')}
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
