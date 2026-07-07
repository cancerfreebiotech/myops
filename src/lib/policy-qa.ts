import { createServiceClient } from '@/lib/supabase/server'

/**
 * 政策問答：以文件庫（已發布且有文字內容的規章/公告/內部文件）為根據回答問題。
 * v1 不做向量檢索 — 文件量小，直接全文入 prompt（有總量上限截斷保護）。
 */

const MAX_CONTEXT_CHARS = 60000
const DOC_TYPES = ['REG', 'ANN', 'INTERNAL']

export interface PolicyAnswer {
  answer: string
  sources: string[]
}

export async function answerPolicyQuestion(question: string, lang: string): Promise<PolicyAnswer | { error: 'no_key' | 'no_docs' | 'llm_error' }> {
  const service = await createServiceClient()

  const { data: setting } = await service.from('system_settings').select('value').eq('key', 'gemini_api_key').single()
  const geminiKey = setting?.value || process.env.GEMINI_API_KEY
  if (!geminiKey) return { error: 'no_key' }

  const { data: docs } = await service
    .from('documents')
    .select('title, doc_type, content_zh, content_en, content_ja, ocr_text')
    .eq('status', 'approved')
    .in('doc_type', DOC_TYPES)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const withContent = (docs ?? []).filter(d => d.content_zh || d.content_en || d.content_ja || d.ocr_text)
  if (!withContent.length) return { error: 'no_docs' }

  let context = ''
  const included: string[] = []
  for (const d of withContent) {
    const body = d.content_zh || d.content_en || d.content_ja || d.ocr_text || ''
    const block = `【${d.title}】\n${body}\n\n`
    if (context.length + block.length > MAX_CONTEXT_CHARS) break
    context += block
    included.push(d.title)
  }

  const langLabel = lang === 'en' ? 'English' : lang === 'ja' ? '日本語' : '繁體中文'
  const prompt = `你是精拓生技內部營運系統 myOPS 的政策助理。僅根據下方公司文件內容回答員工的問題。

規則：
1. 只根據文件內容回答，不要編造。文件中找不到答案時，直接說明文件中沒有相關規定，建議洽詢 HR 或管理員。
2. 回答使用${langLabel}，簡潔、條列重點。
3. 回答末尾以「出處：」列出你引用的文件標題（僅列實際引用的）。

=== 公司文件 ===
${context}
=== 文件結束 ===

員工問題：${question}`

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
    }
  )
  if (!geminiRes.ok) return { error: 'llm_error' }

  const geminiData = await geminiRes.json()
  const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!answer) return { error: 'llm_error' }

  return { answer, sources: included }
}
