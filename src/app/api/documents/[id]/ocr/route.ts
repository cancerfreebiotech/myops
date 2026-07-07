import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// OCR 抽取逾時（ms）：多模態 LLM / Vision 代理可能較慢
const OCR_TIMEOUT_MS = 60000

/**
 * 對單一文件執行 OCR 抽取並存回 documents.ocr_text。
 *
 * OCR ADAPTER 契約（通用、可由管理員設定 endpoint）：
 *   POST {ocr_api_url}
 *     Header: Authorization: Bearer {ocr_api_key}（未設 key 則不帶）
 *     Body(JSON): { file_url: string(短期 signed URL), file_name: string|null, doc_id: string }
 *     預期回應(JSON): { text: string }
 *   管理員可把 endpoint 指向：自架 OCR HTTP 服務、雲端 Vision 代理、
 *   或多模態 LLM 代理（收 signed URL → 下載檔案 → 回純文字）。
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 權限：admin 或具文件管理權限（approve_contract / publish_announcement）
  const { data: currentUser } = await service
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const features = (currentUser?.granted_features as string[] | null) ?? []
  const canManage = currentUser?.role === 'admin'
    || features.includes('approve_contract')
    || features.includes('publish_announcement')
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 防 IDOR：OCR 觸發權限集合比 documents SELECT RLS 寬（publish_announcement 不在讀取授權內），
  // 故先以「呼叫者本人身分」（RLS）確認確實可讀此文件，否則不得 OCR 其內容。
  const { data: readable } = await supabase
    .from('documents')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (!readable) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 需真正繞過 RLS：system_settings 非 feature.* key 僅 admin 可讀；
  // documents UPDATE RLS 也只允許 uploaded_by/admin/approve_contract。
  // 已於上方做明確授權檢查，故此處用真 service-role client。
  const admin = createAdminClient()

  const { data: doc } = await admin
    .from('documents')
    .select('id, file_url, file_name, deleted_at')
    .eq('id', id)
    .single()
  if (!doc || doc.deleted_at) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!doc.file_url) return NextResponse.json({ error: 'No file to OCR', code: 'NO_FILE' }, { status: 400 })

  const { data: settings } = await admin
    .from('system_settings')
    .select('key, value')
    .in('key', ['ocr_api_url', 'ocr_api_key'])
  const ocrUrl = settings?.find(s => s.key === 'ocr_api_url')?.value?.trim()
  const ocrKey = settings?.find(s => s.key === 'ocr_api_key')?.value?.trim()
  if (!ocrUrl) {
    return NextResponse.json({ error: 'OCR endpoint not configured', code: 'NO_OCR_ENDPOINT' }, { status: 400 })
  }

  // file_url 為 'documents' bucket 內的相對路徑；產生短期 signed URL 供 OCR 服務抓檔
  const { data: signed } = await admin.storage
    .from('documents')
    .createSignedUrl(doc.file_url, 600)
  if (!signed?.signedUrl) return NextResponse.json({ error: 'Failed to sign file URL' }, { status: 400 })

  let text = ''
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), OCR_TIMEOUT_MS)
    const res = await fetch(ocrUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ocrKey ? { Authorization: `Bearer ${ocrKey}` } : {}),
      },
      body: JSON.stringify({
        file_url: signed.signedUrl,
        file_name: doc.file_name,
        doc_id: doc.id,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      return NextResponse.json({ error: `OCR endpoint error (${res.status})`, code: 'OCR_ERROR' }, { status: 502 })
    }
    const json = await res.json().catch(() => null)
    text = (json?.text ?? '').toString().trim()
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError' ? 'OCR timeout' : 'OCR request failed'
    return NextResponse.json({ error: msg, code: 'OCR_ERROR' }, { status: 502 })
  }

  if (!text) return NextResponse.json({ error: 'OCR returned empty text', code: 'OCR_EMPTY' }, { status: 422 })

  const { error: updErr } = await admin.from('documents').update({ ocr_text: text }).eq('id', id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

  await admin.from('audit_logs').insert({
    doc_id: id, user_id: user.id, action: 'ocr', detail: { chars: text.length },
  })

  return NextResponse.json({ data: { ocr_text: text, chars: text.length } })
}
