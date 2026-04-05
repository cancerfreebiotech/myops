'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/StatusBadge'
import { Search, FileText, AlertTriangle } from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'

const DOC_TYPE_KEYS = ['NDA', 'MOU', 'CONTRACT', 'AMEND'] as const

interface Props {
  companies: any[]
  currentUser: any
  canApprove: boolean
}

export function ContractsClient({ companies, currentUser, canApprove }: Props) {
  const router = useRouter()
  const t = useTranslations('contracts')
  const tc = useTranslations('common')
  const [contracts, setContracts] = useState<any[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCompany, setFilterCompany] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchContracts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ folder: 'contracts', page: String(page) })
    if (search) params.set('search', search)
    if (filterType) params.set('doc_type', filterType)
    if (filterStatus) params.set('status', filterStatus)
    if (filterCompany) params.set('company_id', filterCompany)

    const res = await fetch(`/api/documents?${params}`)
    const { data, count } = await res.json()
    setContracts(data ?? [])
    setCount(count ?? 0)
    setLoading(false)
  }, [page, search, filterType, filterStatus, filterCompany])

  useEffect(() => { fetchContracts() }, [fetchContracts])

  const PAGE_SIZE = 20
  const totalPages = Math.ceil(count / PAGE_SIZE)

  const expiryWarning = (expiresAt: string | null) => {
    if (!expiresAt) return null
    const days = differenceInDays(parseISO(expiresAt), new Date())
    if (days < 0) return 'expired'
    if (days <= 30) return 'warning'
    return null
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder={`${tc('search')}...`} value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={v => { setFilterType(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t('allTypes')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allTypes')}</SelectItem>
            {DOC_TYPE_KEYS.map(k => <SelectItem key={k} value={k}>{t(`docTypes.${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue placeholder={tc('filter')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{tc('filter')}</SelectItem>
            <SelectItem value="pending">{tc('pending')}</SelectItem>
            <SelectItem value="approved">{tc('approved')}</SelectItem>
            <SelectItem value="rejected">{tc('rejected')}</SelectItem>
            <SelectItem value="archived">{t('statusFilter.archived')}</SelectItem>
            <SelectItem value="expired">{t('statusFilter.expired')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCompany} onValueChange={v => { setFilterCompany(v ?? ''); setPage(1) }}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t('company')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('company')}</SelectItem>
            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800">
              <TableHead>{t('title')}</TableHead>
              <TableHead>{t('type')}</TableHead>
              <TableHead>{t('company')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('expiresAt')}</TableHead>
              <TableHead>{t('owner')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">{tc('loading')}</TableCell></TableRow>
            ) : contracts.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">{t('noContracts')}</TableCell></TableRow>
            ) : contracts.map(doc => {
              const warn = expiryWarning(doc.expires_at)
              return (
                <TableRow
                  key={doc.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => router.push(`/documents/${doc.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-slate-400 shrink-0" />
                      <span className="font-medium text-sm truncate max-w-[220px]">{doc.title}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{t(`docTypes.${doc.doc_type}` as any) ?? doc.doc_type}</Badge></TableCell>
                  <TableCell className="text-sm text-slate-500">{doc.company?.name ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={doc.status} /></TableCell>
                  <TableCell>
                    {doc.expires_at ? (
                      <div className="flex items-center gap-1">
                        {warn && <AlertTriangle size={13} className={warn === 'expired' ? 'text-red-500' : 'text-amber-500'} />}
                        <span className={`text-sm ${warn === 'expired' ? 'text-red-600 dark:text-red-400' : warn === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>
                          {doc.expires_at}
                        </span>
                      </div>
                    ) : <span className="text-slate-400">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">{doc.uploaded_by_user?.display_name ?? '—'}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>{tc('total')} {count}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="min-h-[36px]">{t('prevPage')}</Button>
            <span>{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="min-h-[36px]">{t('nextPage')}</Button>
          </div>
        </div>
      )}
    </>
  )
}
