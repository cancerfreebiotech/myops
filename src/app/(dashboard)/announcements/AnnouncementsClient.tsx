'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/StatusBadge'
import { Search, Users, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'

const CATEGORY_LABELS: Record<string, string> = {
  hr: '人事公告', admin: '行政公告', regulation: '法規/規章', urgent: '緊急通知',
}

interface Props {
  currentUser: any
  canPublish: boolean
  reportData: any[]
  userId: string
}

export function AnnouncementsClient({ currentUser, canPublish, reportData, userId }: Props) {
  const router = useRouter()
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [myPending, setMyPending] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [tab, setTab] = useState<'all' | 'my' | 'report'>('my')

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ doc_type: 'ANN' })
    if (search) params.set('search', search)
    const res = await fetch(`/api/documents?${params}`)
    const { data } = await res.json()
    setAnnouncements(data ?? [])

    // My pending confirmations
    const myRes = await fetch('/api/announcements/my-pending')
    const myData = await myRes.json()
    setMyPending(myData.data ?? [])
    setLoading(false)
  }, [search])

  useEffect(() => { fetchAnnouncements() }, [fetchAnnouncements])

  const filtered = announcements.filter(a =>
    !filterCategory || a.announcement_category === filterCategory
  )

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {[
          { key: 'my', label: '待我確認', badge: myPending.length },
          { key: 'all', label: '全部公告' },
          ...(canPublish ? [{ key: 'report', label: '發佈報表' }] : []),
        ].map((t: any) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs bg-red-500 text-white rounded-full">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* My pending confirmations */}
      {tab === 'my' && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-center py-8 text-slate-400 text-sm">載入中...</p>
          ) : myPending.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle size={32} className="text-green-400 mx-auto mb-2" />
              <p className="text-slate-500">沒有待確認的公告</p>
            </div>
          ) : myPending.map((item: any) => (
            <div
              key={item.id}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 cursor-pointer hover:border-blue-300 transition-colors"
              onClick={() => router.push(`/documents/${item.document_id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{item.document?.title}</p>
                  {item.document?.announcement_category && (
                    <Badge variant="outline" className="text-xs mt-1">{CATEGORY_LABELS[item.document.announcement_category] ?? item.document.announcement_category}</Badge>
                  )}
                </div>
                <span className="text-xs text-slate-400 shrink-0">{format(new Date(item.document?.created_at ?? item.created_at), 'MM/dd')}</span>
              </div>
              {item.document?.content_zh && (
                <p className="text-sm text-slate-500 mt-2 line-clamp-2">{item.document.content_zh}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">待確認閱讀</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All announcements */}
      {tab === 'all' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="搜尋公告..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterCategory} onValueChange={v => setFilterCategory(v ?? '')}>
              <SelectTrigger className="w-36"><SelectValue placeholder="所有分類" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">所有分類</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            {loading ? (
              <p className="text-center py-8 text-slate-400 text-sm">載入中...</p>
            ) : filtered.length === 0 ? (
              <p className="text-center py-8 text-slate-400 text-sm">無公告</p>
            ) : filtered.map((doc: any) => (
              <div
                key={doc.id}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 cursor-pointer hover:border-blue-300 transition-colors"
                onClick={() => router.push(`/documents/${doc.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{doc.title}</p>
                      {doc.announcement_category && (
                        <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[doc.announcement_category] ?? doc.announcement_category}</Badge>
                      )}
                    </div>
                    {doc.content_zh && (
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{doc.content_zh}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={doc.status} />
                    <span className="text-xs text-slate-400">{format(new Date(doc.created_at), 'yyyy/MM/dd')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Publisher report */}
      {tab === 'report' && canPublish && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">已發佈公告確認狀況</h3>
          {reportData.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm">無資料</p>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">公告標題</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">分類</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">發佈日期</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">確認狀況</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {reportData.map((doc: any) => {
                    const total = doc.document_recipients?.length ?? 0
                    return (
                      <tr
                        key={doc.id}
                        className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                        onClick={() => router.push(`/documents/${doc.id}`)}
                      >
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 max-w-[260px] truncate">{doc.title}</td>
                        <td className="px-4 py-3 text-slate-500">{CATEGORY_LABELS[doc.announcement_category] ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-500">{format(new Date(doc.created_at), 'yyyy/MM/dd')}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Users size={13} className="text-slate-400" />
                            <span className="text-slate-600 dark:text-slate-400">{total} 人</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
