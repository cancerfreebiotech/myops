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

const schema = z.object({
  title: z.string().min(1, '必填'),
  doc_type: z.enum(['ANN','REG','NDA','MOU','CONTRACT','AMEND','INTERNAL']),
  folder: z.string(),
  department_id: z.string().optional(),
  company_id: z.string().optional(),
  expires_at: z.string().optional(),
  announcement_category: z.string().optional(),
  content_zh: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

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
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

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
      toast.error('請選擇要上傳的檔案')
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
      if (presignedError) { toast.error('取得上傳連結失敗'); setUploading(false); return }

      // 2. Upload directly to Supabase Storage
      const uploadRes = await fetch(presigned.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) { toast.error('檔案上傳失敗'); setUploading(false); return }

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

    toast.success('文件已上傳')
    setUploading(false)
    onSuccess()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem>
            <FormLabel>文件標題</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="doc_type" render={({ field }) => (
          <FormItem>
            <FormLabel>文件類型</FormLabel>
            <Select value={field.value} onValueChange={onDocTypeChange}>
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                {canPublish && <><SelectItem value="ANN">公告</SelectItem><SelectItem value="REG">規章</SelectItem></>}
                <SelectItem value="NDA">保密協議 (NDA)</SelectItem>
                <SelectItem value="MOU">合作備忘錄 (MOU)</SelectItem>
                <SelectItem value="CONTRACT">合約</SelectItem>
                <SelectItem value="AMEND">合約修正</SelectItem>
                <SelectItem value="INTERNAL">內部文件</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )} />

        {isAnnouncement && (
          <>
            <FormField control={form.control} name="announcement_category" render={({ field }) => (
              <FormItem>
                <FormLabel>公告分類</FormLabel>
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue placeholder="選擇分類" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="hr">人事公告</SelectItem>
                    <SelectItem value="admin">行政公告</SelectItem>
                    <SelectItem value="regulation">法規/規章</SelectItem>
                    <SelectItem value="urgent">緊急通知</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            <FormField control={form.control} name="content_zh" render={({ field }) => (
              <FormItem>
                <FormLabel>公告內容（中文）</FormLabel>
                <FormControl><Textarea {...field} rows={5} placeholder="輸入公告內容..." /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </>
        )}

        {isContract && (
          <>
            <FormField control={form.control} name="company_id" render={({ field }) => (
              <FormItem>
                <FormLabel>關聯公司</FormLabel>
                <Select value={field.value ?? ''} onValueChange={v => field.onChange(v || undefined)}>
                  <FormControl><SelectTrigger><SelectValue placeholder="選擇公司" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            <FormField control={form.control} name="expires_at" render={({ field }) => (
              <FormItem>
                <FormLabel>合約到期日</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
              </FormItem>
            )} />
          </>
        )}

        {docType === 'INTERNAL' && (
          <FormField control={form.control} name="department_id" render={({ field }) => (
            <FormItem>
              <FormLabel>所屬部門</FormLabel>
              <Select value={field.value ?? currentUser?.department_id ?? ''} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue placeholder="選擇部門" /></SelectTrigger></FormControl>
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
            {isAnnouncement ? '附件（選填）' : '上傳檔案'}
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
            {uploading ? '上傳中...' : '確認上傳'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
