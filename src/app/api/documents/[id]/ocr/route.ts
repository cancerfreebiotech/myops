import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getLlmConfig, llmComplete } from '@/lib/llm'

// 檔案大小上限（base64 入 prompt；再大的掃描檔請分割）
const OCR_MAX_FILE_BYTES = 15 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

/**
 * 對單一文件執行 OCR 抽取並存回 documents.ocr_text。
 * 使用 /admin/settings「AI 連線」的視覺模型（gemini / anthropic 支援圖片與 PDF；
 * openai 相容端點支援圖片，PDF 會回明確錯誤）。無獨立 OCR 服務。
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

  const llm = await getLlmConfig(admin)
  if (!llm) {
    return NextResponse.json({ error: 'AI API Key not configured', code: 'NO_AI_KEY' }, { status: 400 })
  }

  // 判斷檔案型別（依副檔名）；file_url 為 'documents' bucket 內的相對路徑
  const ext = (doc.file_name ?? doc.file_url).split('.').pop()?.toLowerCase() ?? ''
  const mimeType = MIME_BY_EXT[ext]
  if (!mimeType) {
    return NextResponse.json({ error: `Unsupported file type for OCR: .${ext}`, code: 'OCR_ERROR' }, { status: 400 })
  }

  const { data: blob, error: dlErr } = await admin.storage.from('documents').download(doc.file_url)
  if (dlErr || !blob) return NextResponse.json({ error: 'Failed to download file' }, { status: 400 })
  if (blob.size > OCR_MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large for OCR (max 15MB)', code: 'OCR_ERROR' }, { status: 400 })
  }
  const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')

  let text = ''
  try {
    text = (await llmComplete(
      llm,
      '抽取這份文件中的所有文字。盡量保持原始段落與排版順序，僅輸出抽取到的文字本身，不要加任何說明或評論。若完全沒有文字，輸出空字串。',
      { temperature: 0, maxTokens: 8192 },
      { mimeType, base64 }
    )).trim()
  } catch (e) {
    console.error('[ocr] vision LLM error:', e)
    return NextResponse.json({ error: `OCR failed: ${String(e).slice(0, 200)}`, code: 'OCR_ERROR' }, { status: 502 })
  }

  if (!text) return NextResponse.json({ error: 'OCR returned empty text', code: 'OCR_EMPTY' }, { status: 422 })

  const { error: updErr } = await admin.from('documents').update({ ocr_text: text }).eq('id', id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

  await admin.from('audit_logs').insert({
    doc_id: id, user_id: user.id, action: 'ocr', detail: { chars: text.length },
  })

  // 向量索引（fire-and-forget；未設 embedding 時自動略過）
  const { indexDocumentSafe } = await import('@/lib/doc-index')
  await indexDocumentSafe(admin, id)

  return NextResponse.json({ data: { ocr_text: text, chars: text.length } })
}
