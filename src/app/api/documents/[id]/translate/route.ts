import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

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

  // Get Gemini API key from system_settings
  const { data: setting } = await service.from('system_settings').select('value').eq('key', 'gemini_api_key').single()
  const geminiKey = setting?.value || process.env.GEMINI_API_KEY
  if (!geminiKey) return NextResponse.json({ error: t('documentTranslate.geminiKeyNotSet') }, { status: 400 })

  const prompt = `You are a professional translator for a biotech company's internal operations system.
Translate the following Chinese text into both English and Japanese.
Return ONLY valid JSON in this exact format (no markdown, no explanation):
{"en": "English translation here", "ja": "Japanese translation here"}

Chinese text to translate:
${doc.content_zh}`

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    }
  )

  if (!geminiRes.ok) {
    const err = await geminiRes.text()
    return NextResponse.json({ error: t('documentTranslate.geminiApiError', { error: err }) }, { status: 502 })
  }

  const geminiData = await geminiRes.json()
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

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
    detail: { provider: 'gemini' },
  })

  return NextResponse.json({ data: translations })
}
