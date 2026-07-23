import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * 物件層授權對應表：bucket → 引用該檔案 path 的來源表/欄位。
 * 授權方式：在使用者自己的 RLS 下查是否存在「引用此 path」的列（createServiceClient 帶 cookie＝以使用者身分跑 RLS），
 * 藉此把各表既有的逐列 SELECT 政策當成物件層授權，補上 storage.objects 粗粒度 bucket 政策的漏洞（IDOR）。
 * - array=true：欄位為 TEXT[]，用 .contains(col, [path])
 * - array=false：欄位為純量 TEXT，用 .eq(col, path)
 * - 值為 null：該 bucket 無「帶 path 的來源表」（insurance-brackets 僅後台用），
 *   直接依賴 storage.objects 的功能 RLS（finance_payroll/hr_manager/is_admin），不另做列檢查。
 */
type Resolver = { table: string; column: string; array: boolean }
const BUCKET_RESOLVERS: Record<string, Resolver[] | null> = {
  documents: [{ table: 'documents', column: 'file_url', array: false }],
  'feedback-screenshots': [{ table: 'feedback', column: 'screenshot_urls', array: true }],
  'expense-receipts': [{ table: 'expense_claims', column: 'receipt_paths', array: true }],
  // training-files 同時來自訓練記錄與證照兩表，兩者都要檢查
  'training-files': [
    { table: 'training_records', column: 'attachment_paths', array: true },
    { table: 'certifications', column: 'attachment_paths', array: true },
  ],
  'asset-files': [{ table: 'asset_logs', column: 'attachment_paths', array: true }],
  'recruiting-files': [{ table: 'candidates', column: 'resume_paths', array: true }],
  // 特殊假別資格申請附件：RLS 已限本人 / HR 可讀 leave_qualification_requests → 當作物件層授權
  'leave-files': [{ table: 'leave_qualification_requests', column: 'attachments', array: true }],
  'insurance-brackets': null,
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const bucket = searchParams.get('bucket')
  const path = searchParams.get('path')
  if (!bucket || !path) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  // 1) bucket allowlist：拒絕未知 bucket，避免探測任意 bucket
  if (!(bucket in BUCKET_RESOLVERS)) {
    return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 })
  }

  // 2) 物件層授權：確認呼叫者在自己 RLS 下看得到引用此 (bucket, path) 的列
  const resolvers = BUCKET_RESOLVERS[bucket]
  if (resolvers) {
    let authorized = false
    for (const r of resolvers) {
      const base = service.from(r.table).select('id', { count: 'exact', head: true })
      const { count, error } = await (r.array ? base.contains(r.column, [path]) : base.eq(r.column, path))
      if (!error && (count ?? 0) > 0) { authorized = true; break }
    }
    // 查無可見列 → 回 404（不確認檔案是否存在，避免資訊洩漏）
    if (!authorized) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data, error } = await service.storage.from(bucket).createSignedUrl(path, 300)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 400 })

  return NextResponse.redirect(data.signedUrl)
}
