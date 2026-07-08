import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getEmbedConfig } from '@/lib/embeddings'
import { indexDocument } from '@/lib/doc-index'

// POST /api/admin/settings/reindex-docs — 全量重建文件向量索引（admin only）
// 給「剛設定好 embedding」時做既有文件回填；之後核准/OCR/翻譯會自動增量索引。
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const cfg = await getEmbedConfig(admin)
  if (!cfg) return NextResponse.json({ error: 'Embedding model not configured', code: 'NO_EMBED' }, { status: 400 })

  const { data: docs } = await admin
    .from('documents')
    .select('id')
    .eq('status', 'approved')
    .is('deleted_at', null)

  let docCount = 0
  let chunkCount = 0
  const failed: string[] = []
  for (const d of docs ?? []) {
    try {
      const n = await indexDocument(admin, d.id)
      if (n > 0) { docCount++; chunkCount += n }
    } catch (e) {
      console.error('[reindex-docs] failed for', d.id, e)
      failed.push(d.id)
    }
  }

  return NextResponse.json({ data: { docs: docCount, chunks: chunkCount, failed: failed.length } })
}
