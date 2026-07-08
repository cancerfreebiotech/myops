import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 通用 LLM 呼叫：供應商 / API key / 端點 / 模型皆由管理員在 /admin/settings 的「AI 連線」設定。
 * 此連線供 AI 翻譯、AI 政策問答與文件 OCR（視覺模型）共用。
 * - ai_provider: 'openai' | 'anthropic' | 'gemini' | 'custom'（custom = OpenAI 相容端點，必填 ai_base_url）
 * - ai_api_key:  API key
 * - ai_base_url: custom 必填；其他供應商留空用官方端點
 * - ai_model:    選填，未設時用各供應商預設
 */

export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'custom'

export const DEFAULT_MODEL: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-1.5-flash',
  custom: '',
}

const DEFAULT_BASE: Record<LlmProvider, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  custom: '',
}

export interface LlmConfig {
  provider: LlmProvider
  apiKey: string
  baseUrl: string
  model: string
}

export function normalizeProvider(raw: string | undefined | null): LlmProvider {
  const p = (raw ?? '').trim().toLowerCase()
  return p === 'openai' || p === 'anthropic' || p === 'custom' ? p : 'gemini'
}

/** 由設定值組出 config；無 key 時回 null（呼叫端顯示「未設定」） */
export function buildLlmConfig(raw: { provider?: string | null; apiKey?: string | null; baseUrl?: string | null; model?: string | null }): LlmConfig | null {
  const provider = normalizeProvider(raw.provider)
  const apiKey = raw.apiKey?.trim() ?? ''
  if (!apiKey) return null
  return {
    provider,
    apiKey,
    baseUrl: (raw.baseUrl?.trim() || DEFAULT_BASE[provider]).replace(/\/+$/, ''),
    model: raw.model?.trim() || DEFAULT_MODEL[provider],
  }
}

/** 讀取 system_settings 的 AI 連線設定；無 key 時回 null */
export async function getLlmConfig(service: SupabaseClient): Promise<LlmConfig | null> {
  const { data: rows } = await service
    .from('system_settings')
    .select('key, value')
    .in('key', ['ai_provider', 'ai_api_key', 'ai_base_url', 'ai_model'])

  const get = (k: string) => rows?.find(r => r.key === k)?.value ?? ''
  return buildLlmConfig({
    provider: get('ai_provider'),
    apiKey: get('ai_api_key'),
    baseUrl: get('ai_base_url'),
    model: get('ai_model'),
  })
}

export interface LlmCallOptions {
  temperature?: number
  maxTokens?: number
}

/** 圖片/PDF 輸入（OCR 用） */
export interface LlmMedia {
  mimeType: string
  base64: string
}

function requireCustomBase(cfg: LlmConfig) {
  if (cfg.provider === 'custom' && !cfg.baseUrl) {
    throw new Error('custom provider requires ai_base_url (OpenAI-compatible endpoint)')
  }
  if (cfg.provider === 'custom' && !cfg.model) {
    throw new Error('custom provider requires ai_model')
  }
}

/** 單輪補全。media（圖片/PDF）給 OCR 用。成功回傳文字；失敗 throw（呼叫端 map 成各自的錯誤碼） */
export async function llmComplete(
  cfg: LlmConfig,
  prompt: string,
  { temperature = 0.2, maxTokens = 1024 }: LlmCallOptions = {},
  media?: LlmMedia
): Promise<string> {
  requireCustomBase(cfg)

  if (cfg.provider === 'openai' || cfg.provider === 'custom') {
    if (media && media.mimeType === 'application/pdf') {
      throw new Error('PDF OCR is not supported on OpenAI-compatible endpoints; use image files or the anthropic/gemini provider')
    }
    const content = media
      ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${media.mimeType};base64,${media.base64}` } },
        ]
      : prompt
    // 端點容錯：使用者常照 OpenAI SDK 慣例貼含 /v1（甚至完整 /v1/chat/completions）的 URL，
    // 一律正規化成 base 再補完整路徑，避免 /v1/v1/... 的 404
    const chatUrl = cfg.baseUrl.replace(/\/v1(\/chat\/completions)?$/, '') + '/v1/chat/completions'
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content }],
        temperature,
        max_tokens: maxTokens,
      }),
    })
    if (!res.ok) throw new Error(`${cfg.provider} ${res.status} (${chatUrl}): ${(await res.text()).slice(0, 300)}`)
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error(`${cfg.provider}: empty response`)
    return text
  }

  if (cfg.provider === 'anthropic') {
    const mediaBlock = media
      ? media.mimeType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: media.base64 } }
        : { type: 'image', source: { type: 'base64', media_type: media.mimeType, data: media.base64 } }
      : null
    const content = mediaBlock ? [mediaBlock, { type: 'text', text: prompt }] : prompt
    const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content }],
      }),
    })
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = await res.json()
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text?.trim()
    if (!text) throw new Error('anthropic: empty response')
    return text
  }

  // gemini（inline_data 支援圖片與 PDF）
  const parts = media
    ? [{ inline_data: { mime_type: media.mimeType, data: media.base64 } }, { text: prompt }]
    : [{ text: prompt }]
  const res = await fetch(
    `${cfg.baseUrl}/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    }
  )
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) throw new Error('gemini: empty response')
  return text
}
