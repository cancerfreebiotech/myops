'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Upload, Search, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { DocumentUploadForm } from './DocumentUploadForm'
import { StatusBadge } from '@/components/StatusBadge'

const DOC_TYPE_KEYS = ['ANN', 'REG', 'NDA', 'MOU', 'CONTRACT', 'AMEND', 'INTERNAL'] as const
const FOLDER_KEYS = ['shared', 'contracts', 'internal', 'archived'] as const

interface DocumentsClientProps {
  departments: any[]
  companies: any[]
  currentUser: any
}

export function DocumentsClient({ departments, companies, currentUser }: DocumentsClientProps) {
  const router = useRouter()
  const t = useTranslations('documents')
  const tc = useTranslations('common')
  const [documents, setDocuments] = useState<any[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterFolder, setFilterFolder] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [loading, setLoading] = useState(true)

  const canPublish = currentUser?.role === 'admin' || currentUser?.granted_features?.includes('publish_announcement')

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (search) params.set('search', search)
    if (filterFolder) params.set('folder', filterFolder)
    if (filterType) params.set('doc_type', filterType)
    if (filterStatus) params.set('status', filterStatus)

    const res = await fetch(`/api/documents?${params}`)
    const { data, count } = await res.json()
    setDocuments(data ?? [])
    setCount(count ?? 0)
    setLoading(false)
  }, [page, search, filterFolder, filterType, filterStatus])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  const PAGE_SIZE = 20
  const totalPages = Math.ceil(count / PAGE_SIZE)

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder={t('searchPlaceholder')} value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
        </div>
        <Select value={filterFolder} onValueChange={v => { setFilterFolder(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t('allFolders')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allFolders')}</SelectItem>
            {FOLDER_KEYS.map(k => <SelectItem key={k} value={k}>{t(`folders.${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={v => { setFilterType(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t('allTypes')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allTypes')}</SelectItem>
            {DOC_TYPE_KEYS.map(k => <SelectItem key={k} value={k}>{t(`docTypes.${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue placeholder={t('allStatuses')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allStatuses')}</SelectItem>
            <SelectItem value="pending">{t('statusFilter.pending')}</SelectItem>
            <SelectItem value="approved">{t('statusFilter.approved')}</SelectItem>
            <SelectItem value="rejected">{t('statusFilter.rejected')}</SelectItem>
            <SelectItem value="archived">{t('statusFilter.archived')}</SelectItem>
            <SelectItem value="expired">{t('statusFilter.expired')}</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowUpload(true)} className="ml-auto min-h-[44px]">
          <Upload size={16} className="mr-1" /> {t('upload')}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800">
              <TableHead>{t('docName')}</TableHead>
              <TableHead>{t('type')}</TableHead>
              <TableHead>{t('folder')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('expiresAt')}</TableHead>
              <TableHead>{t('uploadedBy')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">{tc('loading')}</TableCell></TableRow>
            ) : documents.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">{tc('noData')}</TableCell></TableRow>
            ) : documents.map(doc => (
              <TableRow
                key={doc.id}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                onClick={() => router.push(`/documents/${doc.id}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-slate-400 shrink-0" />
                    <span className="font-medium text-sm truncate max-w-[260px]">{doc.title}</span>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{(DOC_TYPE_KEYS as readonly string[]).includes(doc.doc_type) ? t(`docTypes.${doc.doc_type}`) : doc.doc_type}</Badge></TableCell>
                <TableCell className="text-sm text-slate-500">{(FOLDER_KEYS as readonly string[]).includes(doc.folder) ? t(`folders.${doc.folder}`) : doc.folder}</TableCell>
                <TableCell><StatusBadge status={doc.status} /></TableCell>
                <TableCell className="text-sm text-slate-500">{doc.expires_at ?? '—'}</TableCell>
                <TableCell className="text-sm text-slate-500">{doc.uploaded_by_user?.display_name ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>{t('totalCount', { count })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="min-h-[36px]">{t('prevPage')}</Button>
            <span>{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="min-h-[36px]">{t('nextPage')}</Button>
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('upload')}</DialogTitle></DialogHeader>
          <DocumentUploadForm
            departments={departments}
            companies={companies}
            canPublish={canPublish}
            currentUser={currentUser}
            onSuccess={() => { setShowUpload(false); fetchDocuments() }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
