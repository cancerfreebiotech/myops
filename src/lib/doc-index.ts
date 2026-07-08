import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmbedConfig, embedTexts } from '@/lib/embeddings'

/**
 * 文件向量索引：把文件內容切段、embedding 後寫入 doc_chunks。
 * 觸發時機：文件核准/發布、OCR 完成、AI 翻譯完成（皆 fire-and-forget，不影響主流程）。
 * 未設定 embedding 模型時靜默略過（政策問答會 fallback 全文入 prompt）。
 * 需以真 service-role client 呼叫（doc_chunks 僅 service-role 可存取）。
 */

const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 150
const EMBED_BATCH = 32

function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, '').trim()
  if (!clean) return []
  if (clean.length <= CHUNK_SIZE) return [clean]
  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length)
    chunks.push(clean.slice(start, end))
    if (end >= clean.length) break
    start = end - CHUNK_OVERLAP
  }
  return chunks
}

/** 對單一文件重建索引。回傳寫入的段數（未設 embedding / 無內容 → 0） */
export async function indexDocument(admin: SupabaseClient, docId: string): Promise<number> {
  const cfg = await getEmbedConfig(admin)
  if (!cfg) return 0

  const { data: doc } = await admin
    .from('documents')
    .select('id, title, status, deleted_at, content_zh, content_en, content_ja, ocr_text')
    .eq('id', docId)
    .single()
  if (!doc || doc.deleted_at) return 0

  const parts: { lang: string; text: string }[] = [
    { lang: 'zh', text: doc.content_zh ?? '' },
    { lang: 'en', text: doc.content_en ?? '' },
    { lang: 'ja', text: doc.content_ja ?? '' },
    { lang: 'ocr', text: doc.ocr_text ?? '' },
  ]

  const rows: { doc_id: string; chunk_index: number; lang: string; content: string }[] = []
  for (const p of parts) {
    for (const c of chunkText(p.text)) {
      rows.push({ doc_id: doc.id, chunk_index: rows.length, lang: p.lang, content: c })
    }
  }

  // 重建：先清舊段（即使新內容為空也要清，避免刪除內容後殘留舊索引）
  await admin.from('doc_chunks').delete().eq('doc_id', doc.id)
  if (!rows.length) return 0

  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const batch = rows.slice(i, i + EMBED_BATCH)
    const vecs = await embedTexts(cfg, batch.map(r => `【${doc.title}】\n${r.content}`))
    const { error } = await admin.from('doc_chunks').insert(
      batch.map((r, j) => ({ ...r, embedding: JSON.stringify(vecs[j]) }))
    )
    if (error) throw new Error(`doc_chunks insert failed: ${error.message}`)
  }
  return rows.length
}

/** fire-and-forget 版本：任何錯誤只記 log，不拋出 */
export async function indexDocumentSafe(admin: SupabaseClient, docId: string): Promise<void> {
  try {
    await indexDocument(admin, docId)
  } catch (e) {
    console.error('[doc-index] index failed for', docId, e)
  }
}
