import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
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

  const { data, error } = await service.from('documents').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (action) {
    await service.from('audit_logs').insert({
      doc_id: id, user_id: user.id, action,
      detail: action === 'reject' ? { reason: body.reject_reason } : null,
    })
  }

  // Teams 通知（fire-and-forget：永不讓通知錯誤影響審核回應）
  if (action === 'approve' || action === 'reject') {
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
        const text = action === 'approve'
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
        const targets = (coos ?? []).filter((c) => c.id !== user.id)
        if (targets.length) {
          const msgs = targets.map((c) => {
            const lang = c.language as string | null
            return {
              userId: c.id as string,
              text: action === 'approve'
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
