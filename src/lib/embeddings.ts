import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Embedding 連線（向量檢索用）。設定於 /admin/settings「AI 連線」的 Embedding 小節：
 * - ai_embed_model:    必填才啟用向量檢索（未設時政策問答 fallback 全文入 prompt）
 * - ai_embed_base_url: 選填，留空沿用 ai_base_url（AI 連線端點）
 * - ai_embed_api_key:  選填，留空沿用 ai_api_key
 * 端點格式自動判斷：generativelanguage.googleapis.com → Gemini embedContent，
 * 其他 → OpenAI 相容 /v1/embeddings（vLLM / Ollama / LiteLLM / OpenAI 皆是）。
 */

export interface EmbedConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export async function getEmbedConfig(service: SupabaseClient): Promise<EmbedConfig | null> {
  const { data: rows } = await service
    .from('system_settings')
    .select('key, value')
    .in('key', ['ai_embed_base_url', 'ai_embed_api_key', 'ai_embed_model', 'ai_base_url', 'ai_api_key', 'ai_provider'])

  const get = (k: string) => rows?.find(r => r.key === k)?.value?.trim() ?? ''
  const model = get('ai_embed_model')
  if (!model) return null

  const provider = get('ai_provider').toLowerCase()
  const fallbackBase = get('ai_base_url')
    || (provider === 'openai' ? 'https://api.openai.com'
      : provider === 'gemini' ? 'https://generativelanguage.googleapis.com'
      : '')
  const baseUrl = (get('ai_embed_base_url') || fallbackBase).replace(/\/+$/, '')
  const apiKey = get('ai_embed_api_key') || get('ai_api_key')
  if (!baseUrl || !apiKey) return null

  return { baseUrl, apiKey, model }
}

/** 批次 embedding。回傳與輸入同序的向量陣列；失敗 throw */
export async function embedTexts(cfg: EmbedConfig, texts: string[]): Promise<number[][]> {
  if (!texts.length) return []

  if (cfg.baseUrl.includes('generativelanguage.googleapis.com')) {
    // Gemini batchEmbedContents
    const res = await fetch(
      `${cfg.baseUrl}/v1beta/models/${cfg.model}:batchEmbedContents?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map(t => ({ model: `models/${cfg.model}`, content: { parts: [{ text: t }] } })),
        }),
      }
    )
    if (!res.ok) throw new Error(`gemini embed ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = await res.json()
    const vecs = (data.embeddings ?? []).map((e: { values: number[] }) => e.values)
    if (vecs.length !== texts.length) throw new Error('gemini embed: count mismatch')
    return vecs
  }

  // OpenAI 相容 /v1/embeddings（端點含 /v1 時自動正規化，避免 /v1/v1）
  const url = cfg.baseUrl.replace(/\/v1(\/embeddings)?$/, '') + '/v1/embeddings'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, input: texts }),
  })
  if (!res.ok) throw new Error(`embed ${res.status} (${url}): ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const items = [...(data.data ?? [])].sort((a: { index: number }, b: { index: number }) => a.index - b.index)
  const vecs = items.map((d: { embedding: number[] }) => d.embedding)
  if (vecs.length !== texts.length) throw new Error('embed: count mismatch')
  return vecs
}
