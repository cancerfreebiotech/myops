'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

const DOC_TYPE_FOLDER: Record<string, string> = {
  ANN: 'shared', REG: 'shared',
  NDA: 'contracts', MOU: 'contracts', CONTRACT: 'contracts', AMEND: 'contracts',
  INTERNAL: 'internal',
}

interface Props {
  departments: any[]
  companies: any[]
  canPublish: boolean
  currentUser: any
  onSuccess: () => void
}

export function DocumentUploadForm({ departments, companies, canPublish, currentUser, onSuccess }: Props) {
  const t = useTranslations('documents')
  const tf = useTranslations('documents.form')
  const tc = useTranslations('common')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const schema = z.object({
    title: z.string().min(1, tf('required')),
    doc_type: z.enum(['ANN','REG','NDA','MOU','CONTRACT','AMEND','INTERNAL']),
    folder: z.string(),
    department_id: z.string().optional(),
    company_id: z.string().optional(),
    expires_at: z.string().optional(),
    announcement_category: z.string().optional(),
    content_zh: z.string().optional(),
  })
  type FormValues = z.infer<typeof schema>

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { doc_type: 'INTERNAL', folder: 'internal' },
  })

  const docType = form.watch('doc_type')
  const isAnnouncement = ['ANN', 'REG'].includes(docType)
  const isContract = ['NDA', 'MOU', 'CONTRACT', 'AMEND'].includes(docType)

  const onDocTypeChange = (val: string | null) => {
    if (!val) return
    form.setValue('doc_type', val as any)
    form.setValue('folder', DOC_TYPE_FOLDER[val] ?? 'internal')
  }

  const onSubmit = async (values: FormValues) => {
    if (!file && !isAnnouncement) {
      toast.error(tf('fileRequired'))
      return
    }
    setUploading(true)

    let file_url = '', file_name = '', file_size = 0

    if (file) {
      // 1. Get presigned URL
      const presignedRes = await fetch('/api/storage/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'documents', filename: file.name }),
      })
      const { data: presigned, error: presignedError } = await presignedRes.json()
      if (presignedError) { toast.error(tf('uploadLinkError')); setUploading(false); return }

      // 2. Upload directly to Supabase Storage
      const uploadRes = await fetch(presigned.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) { toast.error(tf('fileUploadError')); setUploading(false); return }

      file_url = presigned.path
      file_name = file.name
      file_size = file.size
    }

    // 3. Create DB record
    const payload: any = { ...values, file_url, file_name, file_size: file_size || undefined }
    if (!values.department_id) delete payload.department_id
    if (!values.company_id) delete payload.company_id
    if (!values.expires_at) delete payload.expires_at
    if (!values.announcement_category) delete payload.announcement_category
    if (!values.content_zh) delete payload.content_zh

    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const { error } = await res.json()
    if (error) { toast.error(error); setUploading(false); return }

    toast.success(tf('documentUploaded'))
    setUploading(false)
    onSuccess()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem>
            <FormLabel>{tf('docTitle')}</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="doc_type" render={({ field }) => (
          <FormItem>
            <FormLabel>{tf('docType')}</FormLabel>
            <Select value={field.value} onValueChange={onDocTypeChange}>
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                {canPublish && <><SelectItem value="ANN">{t('docTypes.ANN')}</SelectItem><SelectItem value="REG">{t('docTypes.REG')}</SelectItem></>}
                <SelectItem value="NDA">{t('docTypes.NDA')} (NDA)</SelectItem>
                <SelectItem value="MOU">{t('docTypes.MOU')} (MOU)</SelectItem>
                <SelectItem value="CONTRACT">{t('docTypes.CONTRACT')}</SelectItem>
                <SelectItem value="AMEND">{t('docTypes.AMEND')}</SelectItem>
                <SelectItem value="INTERNAL">{t('docTypes.INTERNAL')}</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )} />

        {isAnnouncement && (
          <>
            <FormField control={form.control} name="announcement_category" render={({ field }) => (
              <FormItem>
                <FormLabel>{tf('announcementCategory')}</FormLabel>
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue placeholder={tf('selectCategory')} /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="hr">{tf('categoryHr')}</SelectItem>
                    <SelectItem value="admin">{tf('categoryAdmin')}</SelectItem>
                    <SelectItem value="regulation">{tf('categoryRegulation')}</SelectItem>
                    <SelectItem value="urgent">{tf('categoryUrgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            <FormField control={form.control} name="content_zh" render={({ field }) => (
              <FormItem>
                <FormLabel>{tf('announcementContent')}</FormLabel>
                <FormControl><Textarea {...field} rows={5} placeholder={tf('contentPlaceholder')} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </>
        )}

        {isContract && (
          <>
            <FormField control={form.control} name="company_id" render={({ field }) => (
              <FormItem>
                <FormLabel>{tf('relatedCompany')}</FormLabel>
                <Select value={field.value ?? ''} onValueChange={v => field.onChange(v || undefined)}>
                  <FormControl><SelectTrigger><SelectValue placeholder={tf('selectCompany')} /></SelectTrigger></FormControl>
                  <SelectContent>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            <FormField control={form.control} name="expires_at" render={({ field }) => (
              <FormItem>
                <FormLabel>{tf('contractExpiresAt')}</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
              </FormItem>
            )} />
          </>
        )}

        {docType === 'INTERNAL' && (
          <FormField control={form.control} name="department_id" render={({ field }) => (
            <FormItem>
              <FormLabel>{tf('department')}</FormLabel>
              <Select value={field.value ?? currentUser?.department_id ?? ''} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue placeholder={tf('selectDepartment')} /></SelectTrigger></FormControl>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        )}

        {/* File upload (not required for announcements) */}
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {isAnnouncement ? tf('attachmentOptional') : tf('uploadFile')}
          </label>
          <input
            type="file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {file && <p className="text-xs text-slate-400 mt-1">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={uploading}>
            {uploading ? tf('uploading') : tf('confirmUpload')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
