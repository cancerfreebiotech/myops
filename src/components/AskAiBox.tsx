'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

/**
 * 政策問答框（Help 頁）。flag `ask_ai` 關閉時 API 回 403 → 首次提問即隱藏整個區塊。
 */
export function AskAiBox() {
  const t = useTranslations('askAi')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const ask = async () => {
    if (!question.trim() || loading) return
    setLoading(true)
    setAnswer(null)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })
      if (res.status === 403) { setHidden(true); return }
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        setErrorMsg(json?.error === 'no_docs' ? t('noDocs') : t('failed'))
        return
      }
      const { data } = await res.json()
      setAnswer(data.answer)
      setSources(data.sources ?? [])
    } catch {
      setErrorMsg(t('failed'))
    } finally {
      setLoading(false)
    }
  }

  if (hidden) return null

  return (
    <Card className="border-blue-200 dark:border-blue-900">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-blue-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('title')}</span>
          <span className="text-xs text-slate-400">{t('subtitle')}</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask()}
            placeholder={t('placeholder')}
            maxLength={500}
          />
          <Button onClick={ask} disabled={loading || !question.trim()} className="shrink-0">
            <Send size={14} className="mr-1" />{loading ? t('asking') : t('ask')}
          </Button>
        </div>
        {errorMsg && <p className="text-sm text-slate-400">{errorMsg}</p>}
        {answer && (
          <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3">
            {answer}
            {sources.length > 0 && (
              <p className="text-xs text-slate-400 mt-2">{t('sourcesNote', { count: sources.length })}</p>
            )}
          </div>
        )}
        <p className="text-xs text-slate-400">{t('disclaimer')}</p>
      </CardContent>
    </Card>
  )
}
