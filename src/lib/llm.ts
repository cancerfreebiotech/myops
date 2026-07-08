import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 通用 LLM 呼叫：供應商 / API key / 端點 / 模型皆由管理員在 system_settings 設定。
 * - ai_provider: 'openai' | 'anthropic' | 'gemini'（預設 gemini）
 * - ai_api_key:  API key（空值時退回舊設定 gemini_api_key / env GEMINI_API_KEY，向下相容）
 * - ai_base_url: 選填。openai 相容端點（Groq/Ollama/LiteLLM/自架 proxy 皆可）或 anthropic/gemini 的替代端點
 * - ai_model:    選填。未設時用各供應商預設
 */

export type LlmProvider = 'openai' | 'anthropic' | 'gemini'

const DEFAULT_MODEL: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-1.5-flash',
}

const DEFAULT_BASE: Record<LlmProvider, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
}

export interface LlmConfig {
  provider: LlmProvider
  apiKey: string
  baseUrl: string
  model: string
}

/** 讀取 AI 設定；無 key 時回 null（呼叫端顯示「未設定」） */
export async function getLlmConfig(service: SupabaseClient): Promise<LlmConfig | null> {
  const { data: rows } = await service
    .from('system_settings')
    .select('key, value')
    .in('key', ['ai_provider', 'ai_api_key', 'ai_base_url', 'ai_model', 'gemini_api_key'])

  const get = (k: string) => rows?.find(r => r.key === k)?.value?.trim() || ''
  const rawProvider = get('ai_provider').toLowerCase()
  const provider: LlmProvider =
    rawProvider === 'openai' || rawProvider === 'anthropic' ? rawProvider : 'gemini'

  // 向下相容：ai_api_key 未設時退回舊的 gemini_api_key / env（僅 gemini）
  const apiKey = get('ai_api_key')
    || (provider === 'gemini' ? (get('gemini_api_key') || process.env.GEMINI_API_KEY || '') : '')
  if (!apiKey) return null

  return {
    provider,
    apiKey,
    baseUrl: (get('ai_base_url') || DEFAULT_BASE[provider]).replace(/\/+$/, ''),
    model: get('ai_model') || DEFAULT_MODEL[provider],
  }
}

export interface LlmCallOptions {
  temperature?: number
  maxTokens?: number
}

/** 單輪文字補全。成功回傳文字；失敗 throw（呼叫端 map 成各自的錯誤碼） */
export async function llmComplete(
  cfg: LlmConfig,
  prompt: string,
  { temperature = 0.2, maxTokens = 1024 }: LlmCallOptions = {}
): Promise<string> {
  if (cfg.provider === 'openai') {
    const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }),
    })
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('openai: empty response')
    return text
  }

  if (cfg.provider === 'anthropic') {
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
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = await res.json()
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text?.trim()
    if (!text) throw new Error('anthropic: empty response')
    return text
  }

  // gemini
  const res = await fetch(
    `${cfg.baseUrl}/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
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
