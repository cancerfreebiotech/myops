import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { buildLlmConfig, llmComplete } from '@/lib/llm'

const TEST_TIMEOUT_MS = 20000

// POST /api/admin/settings/ai-test — 測試 AI 連線（admin only）
// body 帶表單目前的值 { provider, api_key, base_url, model }；api_key 空值時用已儲存的 key。
// 結果（成功/失敗 + 時間）持久化到 system_settings.ai_last_test，設定頁重整後仍可見。
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  let apiKey: string = (body.api_key ?? '').trim()
  if (!apiKey) {
    const { data: saved } = await service.from('system_settings').select('value').eq('key', 'ai_api_key').single()
    apiKey = saved?.value?.trim() ?? ''
  }

  const cfg = buildLlmConfig({ provider: body.provider, apiKey, baseUrl: body.base_url, model: body.model })
  const at = new Date().toISOString()

  let result: { ok: boolean; model?: string; ms?: number; error?: string; at: string }
  if (!cfg) {
    result = { ok: false, error: 'API Key not set', at }
  } else {
    const started = Date.now()
    try {
      await Promise.race([
        llmComplete(cfg, 'Reply with exactly: OK', { temperature: 0, maxTokens: 8 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout (20s)')), TEST_TIMEOUT_MS)),
      ])
      result = { ok: true, model: cfg.model, ms: Date.now() - started, at }
    } catch (e) {
      result = { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 300), at }
    }
  }

  await service.from('system_settings')
    .upsert({ key: 'ai_last_test', value: JSON.stringify(result) }, { onConflict: 'key' })

  return NextResponse.json({ data: result })
}
