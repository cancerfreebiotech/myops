'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Send } from 'lucide-react'

export function FeedbackForm() {
  const router = useRouter()
  const t = useTranslations('feedback')
  const tc = useTranslations('common')
  const [type, setType] = useState('feature')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error(t('requiredFields'))
      return
    }
    setLoading(true)

    let screenshot_url: string | null = null

    if (screenshot) {
      const presignedRes = await fetch('/api/storage/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'feedback-screenshots', filename: screenshot.name }),
      })
      const { data: presigned, error: pErr } = await presignedRes.json()
      if (!pErr && presigned) {
        await fetch(presigned.signedUrl, { method: 'PUT', body: screenshot, headers: { 'Content-Type': screenshot.type } })
        screenshot_url = presigned.path
      }
    }

    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, description, screenshot_url }),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success(t('submitted'))
    router.push('/')
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('formType')} <span className="text-red-500">*</span></label>
        <Select value={type} onValueChange={v => setType(v ?? 'feature')}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="feature">{t('typeFeature')}</SelectItem>
            <SelectItem value="bug">{t('typeBug')}</SelectItem>
            <SelectItem value="improvement">{t('typeImprovement')}</SelectItem>
            <SelectItem value="other">{t('typeOther')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('formTitle')} <span className="text-red-500">*</span></label>
        <Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1" placeholder={t('titlePlaceholder')} />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('formDescription')} <span className="text-red-500">*</span></label>
        <Textarea rows={5} value={description} onChange={e => setDescription(e.target.value)} className="mt-1" placeholder={t('descriptionPlaceholder')} />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('screenshotOptional')}</label>
        <input
          type="file"
          accept="image/*"
          onChange={e => setScreenshot(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {screenshot && <p className="text-xs text-slate-400 mt-1">{screenshot.name}</p>}
      </div>
      <Button onClick={handleSubmit} disabled={loading} className="min-h-[44px]">
        <Send size={15} className="mr-1.5" />
        {loading ? tc('submitting') : t('submitFeedback')}
      </Button>
    </div>
  )
}
