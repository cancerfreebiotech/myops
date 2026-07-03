import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getFeatureFlags } from '@/lib/feature-flags'
import { answerPolicyQuestion } from '@/lib/policy-qa'

// POST /api/ask { question } — 政策問答（flag `ask_ai` 開啟時）
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const flags = await getFeatureFlags()
  if (!flags.ask_ai) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { question } = await request.json()
  if (!question?.trim() || question.length > 500) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data: me } = await supabase.from('users').select('language').eq('id', user.id).single()
  const result = await answerPolicyQuestion(question.trim(), me?.language ?? 'zh-TW')

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.error === 'llm_error' ? 502 : 404 })
  }
  return NextResponse.json({ data: result })
}
