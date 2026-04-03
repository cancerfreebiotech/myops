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
import { DocumentUploadForm } from './DocumentUploadForm'
import { StatusBadge } from '@/components/StatusBadge'

const DOC_TYPE_LABELS: Record<string, string> = {
  ANN: '公告', REG: '規章', NDA: '保密協議', MOU: '合作備忘錄',
  CONTRACT: '合約', AMEND: '合約修正', INTERNAL: '內部文件',
}
const FOLDER_LABELS: Record<string, string> = {
  shared: '全公司共用', contracts: '外部合約', internal: '內部文件', archived: '封存',
}

interface DocumentsClientProps {
  departments: any[]
  companies: any[]
  currentUser: any
}

export function DocumentsClient({ departments, companies, currentUser }: DocumentsClientProps) {
  const router = useRouter()
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
          <Input placeholder="搜尋文件名稱..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
        </div>
        <Select value={filterFolder} onValueChange={v => { setFilterFolder(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="所有資料夾" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">所有資料夾</SelectItem>
            {Object.entries(FOLDER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={v => { setFilterType(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="所有類型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">所有類型</SelectItem>
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="所有狀態" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">所有狀態</SelectItem>
            <SelectItem value="pending">待審核</SelectItem>
            <SelectItem value="approved">已核准</SelectItem>
            <SelectItem value="rejected">已退回</SelectItem>
            <SelectItem value="archived">已封存</SelectItem>
            <SelectItem value="expired">已到期</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowUpload(true)} className="ml-auto min-h-[44px]">
          <Upload size={16} className="mr-1" /> 上傳文件
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800">
              <TableHead>文件名稱</TableHead>
              <TableHead>類型</TableHead>
              <TableHead>資料夾</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>到期日</TableHead>
              <TableHead>上傳者</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">載入中...</TableCell></TableRow>
            ) : documents.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">無資料</TableCell></TableRow>
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
                <TableCell><Badge variant="outline" className="text-xs">{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</Badge></TableCell>
                <TableCell className="text-sm text-slate-500">{FOLDER_LABELS[doc.folder] ?? doc.folder}</TableCell>
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
          <span>共 {count} 筆</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="min-h-[36px]">上一頁</Button>
            <span>{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="min-h-[36px]">下一頁</Button>
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>上傳文件</DialogTitle></DialogHeader>
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
