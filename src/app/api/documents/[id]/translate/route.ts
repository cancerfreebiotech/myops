import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getLlmConfig, llmComplete } from '@/lib/llm'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  // Check canPublish
  const { data: currentUser } = await supabase.from('users').select('role, granted_features').eq('id', user.id).single()
  const canPublish = currentUser?.role === 'admin' || currentUser?.granted_features?.includes('publish_announcement')
  if (!canPublish) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { data: doc } = await service.from('documents').select('id, content_zh, title').eq('id', id).single()
  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  if (!doc.content_zh) return NextResponse.json({ error: t('documentTranslate.noChineseContent') }, { status: 400 })

  // AI 設定（供應商/key/端點/模型由 /admin/settings 配置；舊 gemini_api_key 向下相容）
  const llm = await getLlmConfig(service)
  if (!llm) return NextResponse.json({ error: t('documentTranslate.geminiKeyNotSet') }, { status: 400 })

  const prompt = `You are a professional translator for a biotech company's internal operations system.
Translate the following Chinese text into both English and Japanese.
Return ONLY valid JSON in this exact format (no markdown, no explanation):
{"en": "English translation here", "ja": "Japanese translation here"}

Chinese text to translate:
${doc.content_zh}`

  let rawText: string
  try {
    rawText = await llmComplete(llm, prompt, { temperature: 0.2, maxTokens: 2048 })
  } catch (e) {
    return NextResponse.json({ error: t('documentTranslate.geminiApiError', { error: String(e).slice(0, 200) }) }, { status: 502 })
  }

  let translations: { en: string; ja: string }
  try {
    const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim()
    translations = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: t('documentTranslate.parseFailed') }, { status: 500 })
  }

  const { error } = await service.from('documents').update({
    content_en: translations.en,
    content_ja: translations.ja,
    ai_translated: true,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // audit_logs 僅允許 service-role 寫入（無 authenticated INSERT policy），且 action 需在
  // audit_logs_action_check 允許集合內：AI 翻譯的合法值為 'ai_translate'（非 'translate'）。
  // 上方已做 canPublish 授權檢查，故此處用真 service-role client 寫稽核（比照 ocr route）。
  const admin = createAdminClient()
  await admin.from('audit_logs').insert({
    doc_id: id,
    user_id: user.id,
    action: 'ai_translate',
    detail: { provider: llm.provider, model: llm.model },
  })

  return NextResponse.json({ data: translations })
}
