'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { StatusBadge } from '@/components/StatusBadge'
import { FeedbackComments } from '@/components/feedback/FeedbackComments'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight, Image as ImageIcon } from 'lucide-react'
import Image from 'next/image'

interface FeedbackItem {
  id: string
  type: string
  title: string
  description: string | null
  status: string
  screenshot_urls: string[] | null
  created_at: string
}

export function MyFeedbackList({ feedbacks }: { feedbacks: FeedbackItem[] }) {
  const router = useRouter()
  const t = useTranslations('feedback')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const TYPE_LABELS: Record<string, string> = {
    feature_request: t('typeFeature'),
    bug_report: t('typeBug'),
  }

  if (feedbacks.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 dark:text-slate-400">{t('empty')}</p>
        <p className="text-sm text-slate-400 mt-1">{t('emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 max-w-3xl">
      {feedbacks.map(f => {
        const expanded = expandedId === f.id
        const shots = f.screenshot_urls ?? []
        return (
          <div key={f.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : f.id)}
              aria-expanded={expanded}
              className="w-full flex items-start justify-between gap-3 p-4 text-left cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                    {TYPE_LABELS[f.type] ?? f.type}
                  </span>
                  <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{f.title}</p>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                  <span className="tabular-nums">{format(new Date(f.created_at), 'yyyy/MM/dd HH:mm')}</span>
                  {shots.length > 0 && (
                    <span className="flex items-center gap-0.5"><ImageIcon size={11} aria-hidden="true" /> {shots.length}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={f.status} />
                {expanded
                  ? <ChevronDown size={16} className="text-slate-400" aria-hidden="true" />
                  : <ChevronRight size={16} className="text-slate-400" aria-hidden="true" />}
              </div>
            </button>

            {expanded && (
              <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-slate-700 pt-3">
                {f.description && (
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{f.description}</p>
                )}
                {shots.map(path => {
                  const url = `/api/storage/download?bucket=feedback-screenshots&path=${encodeURIComponent(path)}`
                  return (
                    <a
                      key={path}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('viewOriginal')}
                      className="block relative w-full aspect-video rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden hover:opacity-90 transition-opacity"
                    >
                      <Image src={url} alt={t('viewOriginal')} fill unoptimized className="object-contain" />
                    </a>
                  )
                })}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                  <FeedbackComments feedbackId={f.id} onReopen={() => router.refresh()} />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
