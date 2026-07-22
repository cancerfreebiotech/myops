'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { MessageCircle, Send } from 'lucide-react'

interface Comment {
  id: string
  body: string
  created_at: string
  author: { id: string; display_name: string | null } | null
}

/**
 * 回饋留言串（admin 詳情 Dialog 與「我的回饋」頁共用）。
 * 授權由 /api/feedback/[id]/comments 把關（admin 或該回饋提交者本人）。
 */
export function FeedbackComments({ feedbackId, onReopen }: { feedbackId: string; onReopen?: () => void }) {
  const t = useTranslations('feedback')
  const tc = useTranslations('common')
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch(`/api/feedback/${feedbackId}/comments`)
        const { data, error } = await res.json()
        if (!active) return
        if (error) { toast.error(error); return }
        setComments(data ?? [])
      } catch {
        if (active) toast.error(tc('error'))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [feedbackId, tc])

  const handleSend = async () => {
    if (!body.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/feedback/${feedbackId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      })
      const { data, error, reopened } = await res.json()
      // 失敗時保留輸入內容供重試
      if (error) { toast.error(error); return }
      setComments(prev => [...prev, data as Comment])
      setBody('')
      if (reopened) {
        toast.success(t('reopened'))
        onReopen?.()
      } else {
        toast.success(t('commentSent'))
      }
    } catch {
      toast.error(tc('error'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
        <MessageCircle size={15} aria-hidden="true" />
        <span>{t('comments')}</span>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">{tc('loading')}</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-slate-400">{t('noComments')}</p>
      ) : (
        <ul className="space-y-2">
          {comments.map(c => (
            <li key={c.id} className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="font-medium text-slate-600 dark:text-slate-300">{c.author?.display_name ?? '—'}</span>
                <span className="tabular-nums">{format(new Date(c.created_at), 'yyyy/MM/dd HH:mm')}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap mt-0.5">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <label htmlFor={`feedback-comment-${feedbackId}`} className="sr-only">{t('comments')}</label>
        <Textarea
          id={`feedback-comment-${feedbackId}`}
          rows={2}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={t('commentPlaceholder')}
        />
        <Button variant="outline" size="sm" onClick={handleSend} disabled={sending || !body.trim()}>
          <Send size={14} className="mr-1.5" aria-hidden="true" />
          {sending ? tc('submitting') : t('sendComment')}
        </Button>
      </div>
    </div>
  )
}
