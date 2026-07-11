import { createAdminClient, createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse, after } from 'next/server'
import { sendProactiveMessage, sendProactiveMessages } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'

// 可透過本路由更新的欄位（審核狀態流轉）；其餘欄位一律拒絕
const ALLOWED_FIELDS = ['status', 'reject_reason', 'approved_at', 'approved_by', 'folder', 'related_doc_id']

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 審核動作限 admin 或具 approve_contract 權限者
  const { data: currentUser } = await service
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const canApprove = currentUser?.role === 'admin'
    || (currentUser?.granted_features as string[] | null)?.includes('approve_contract')
  if (!canApprove) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 審核動作需 MFA（aal2），與請假/加班/報帳/出差/採購一致
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'MFA required', code: 'MFA_REQUIRED' }, { status: 403 })
  }

  const body = await request.json()
  const action = body._action as string | undefined
  delete body._action

  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED_FIELDS.includes(k)))
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No permitted fields' }, { status: 400 })
  }

  // 涉及狀態變更時，讀取當前文件做把關（狀態機 + 職責分離）。
  if (typeof updates.status === 'string') {
    const { data: target } = await service
      .from('documents')
      .select('uploaded_by, status')
      .eq('id', id)
      .single()
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // 狀態機把關：僅允許合法轉移，禁止回退/跳關與對終態文件重複核准
    // （避免重複觸發 COO 通知與向量重建）。
    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      pending: ['approved', 'rejected'],
      approved: ['archived'],
    }
    const allowed = ALLOWED_TRANSITIONS[target.status] ?? []
    if (!allowed.includes(updates.status as string)) {
      return NextResponse.json({ error: 'Invalid status transition', code: 'INVALID_TRANSITION' }, { status: 409 })
    }

    // 職責分離：核准（status→approved）時不得核准自己上傳的文件（與請假/加班/出差/報帳一致）。
    // documents_status_guard 與 UPDATE RLS 都不排除 uploaded_by=自己，故此把關必須在 app 層做。
    if (updates.status === 'approved') {
      if (target.uploaded_by === user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      // 核准人由 server 端補寫，不依賴前端傳入（與 publish route 一致）。
      updates.approved_by = user.id
    }
  }

  // 是否為「真實」的審核狀態轉移：唯有通過上方狀態機把關的 status 變更才算。
  // 所有副作用（稽核、向量索引、Teams/COO 通知）一律綁定真實轉移，而非前端傳來的
  // _action 字串——否則帶 _action 卻無 status 轉移的純 metadata 更新（如改 folder）
  // 會重複觸發 COO 通知與向量重建。
  const approvedNow = updates.status === 'approved'
  const rejectedNow = updates.status === 'rejected'

  const { data, error } = await service.from('documents').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // 核准時建向量索引（回應後在背景執行；未設 embedding 時自動略過）
  if (approvedNow) {
    after(async () => {
      const { indexDocumentSafe } = await import('@/lib/doc-index')
      await indexDocumentSafe(createAdminClient(), id)
    })
  }

  if (action && (approvedNow || rejectedNow)) {
    // audit_logs 無 authenticated INSERT policy（service role only），須用 admin client 才寫得進去
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      doc_id: id, user_id: user.id, action,
      detail: rejectedNow ? { reason: body.reject_reason } : null,
    })
  }

  // Teams 通知（fire-and-forget：永不讓通知錯誤影響審核回應）
  if (approvedNow || rejectedNow) {
    try {
      const doc = data as {
        uploaded_by: string | null
        doc_type: string
        title: string
        title_en: string | null
        title_ja: string | null
        reject_reason: string | null
      }
      const pickTitle = (lang: string | null | undefined) =>
        lang === 'en' ? (doc.title_en || doc.title)
          : lang === 'ja' ? (doc.title_ja || doc.title)
            : doc.title

      // (a) 通知上傳者/申請人審核結果（用其語言）
      let uploaderName = '-'
      if (doc.uploaded_by) {
        const { data: applicant } = await service
          .from('users')
          .select('language, display_name')
          .eq('id', doc.uploaded_by)
          .single()
        uploaderName = applicant?.display_name ?? '-'
        const title = pickTitle(applicant?.language)
        const text = approvedNow
          ? teamsText(applicant?.language, 'documentApproved', { title })
          : teamsText(applicant?.language, 'documentRejected', { title, reason: doc.reject_reason ?? '-' })
        await sendProactiveMessage(doc.uploaded_by, text)
      }

      // (b) 合約類文件（CONTRACT/NDA/MOU/AMEND）知會 COO；一般文件不通知
      const CONTRACT_TYPES = ['CONTRACT', 'NDA', 'MOU', 'AMEND']
      if (CONTRACT_TYPES.includes(doc.doc_type)) {
        const { data: coos } = await service
          .from('users')
          .select('id, language')
          .eq('job_role', 'coo')
          .eq('is_active', true)
        const targets = (coos ?? []).filter((c) => c.id !== user.id)
        if (targets.length) {
          const msgs = targets.map((c) => {
            const lang = c.language as string | null
            return {
              userId: c.id as string,
              text: approvedNow
                ? teamsText(lang, 'contractApprovedCoo', { title: pickTitle(lang), applicant: uploaderName })
                : teamsText(lang, 'contractRejectedCoo', { title: pickTitle(lang), applicant: uploaderName, reason: doc.reject_reason ?? '-' }),
            }
          })
          await sendProactiveMessages(msgs)
        }
      }
    } catch (e) {
      console.error('[documents] Teams notify failed:', e)
    }
  }

  return NextResponse.json({ data })
}
