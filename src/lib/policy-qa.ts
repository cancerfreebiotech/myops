import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { getLlmConfig, llmComplete } from '@/lib/llm'
import { getEmbedConfig, embedTexts } from '@/lib/embeddings'

/**
 * 政策問答：以文件庫（已發布且有文字內容的規章/公告/內部文件）為根據回答問題。
 * 已設定 embedding 模型且索引有段落時走向量檢索（pgvector top-k）；
 * 否則 fallback 全文入 prompt（有總量上限截斷保護）。
 */

const VECTOR_TOP_K = 12

const MAX_CONTEXT_CHARS = 60000
const DOC_TYPES = ['REG', 'ANN', 'INTERNAL']

export interface PolicyAnswer {
  answer: string
  sources: string[]
}

export async function answerPolicyQuestion(question: string, lang: string): Promise<PolicyAnswer | { error: 'no_key' | 'no_docs' | 'llm_error' }> {
  const service = await createServiceClient()

  const llm = await getLlmConfig(service)
  if (!llm) return { error: 'no_key' }

  // 優先：向量檢索（embedding 已設定且問題可成功轉向量、索引有結果時）
  let context = ''
  let included: string[] = []
  try {
    const embedCfg = await getEmbedConfig(service)
    if (embedCfg) {
      const admin = createAdminClient()
      const [qVec] = await embedTexts(embedCfg, [question])
      const { data: hits, error } = await admin.rpc('match_doc_chunks', {
        query_embedding: JSON.stringify(qVec),
        match_count: VECTOR_TOP_K,
      })
      if (!error && hits?.length) {
        const titles = new Set<string>()
        for (const h of hits as { title: string; content: string }[]) {
          context += `【${h.title}】\n${h.content}\n\n`
          titles.add(h.title)
        }
        included = [...titles]
      }
    }
  } catch (e) {
    console.error('[policy-qa] vector retrieval failed, falling back to full-text:', e)
    context = ''
    included = []
  }

  // Fallback：全文入 prompt（未設 embedding / 索引為空 / 檢索失敗）
  if (!context) {
    const { data: docs } = await service
      .from('documents')
      .select('title, doc_type, content_zh, content_en, content_ja, ocr_text')
      .eq('status', 'approved')
      .in('doc_type', DOC_TYPES)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    const withContent = (docs ?? []).filter(d => d.content_zh || d.content_en || d.content_ja || d.ocr_text)
    if (!withContent.length) return { error: 'no_docs' }

    for (const d of withContent) {
      const body = d.content_zh || d.content_en || d.content_ja || d.ocr_text || ''
      const block = `【${d.title}】\n${body}\n\n`
      if (context.length + block.length > MAX_CONTEXT_CHARS) break
      context += block
      included.push(d.title)
    }
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

  let answer: string
  try {
    answer = await llmComplete(llm, prompt, { temperature: 0.2, maxTokens: 1024 })
  } catch (e) {
    console.error('[policy-qa] LLM error:', e)
    return { error: 'llm_error' }
  }

  return { answer, sources: included }
}
