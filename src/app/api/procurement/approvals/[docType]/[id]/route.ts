import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isDocType } from '@/lib/procurement/doc-types'
import {
  ApprovalEngineError,
  actOnStep,
  submitForApproval,
  type ApprovalErrorCode,
} from '@/lib/procurement/approval-engine'

// Shared approval endpoint for all 10 procurement document types.
// PATCH /api/procurement/approvals/[docType]/[id]
// body: { action: 'submit' | 'approve' | 'reject' | 'ack', comment?: string }
//
// - submit: draft → in_approval (creates procurement_approval_steps, notifies step 1)
// - approve/reject: act on the current step — AAL2 MFA required (same gate as leave)
// - ack: acknowledge an 'anyone' notification step (no MFA)

const ERROR_STATUS: Record<ApprovalErrorCode, number> = {
  docNotFound: 404,
  onlyDraftSubmittable: 400,
  submitNotAllowed: 403,
  notInApproval: 400,
  notYourTurn: 403,
  approverUnresolved: 400,
  invalidAction: 400,
  ackOnlyNotifyStep: 400,
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ docType: string; id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { docType, id } = await params

  if (!isDocType(docType)) {
    return NextResponse.json({ error: t('procurement.invalidDocType') }, { status: 400 })
  }

  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  let body: { action?: string; comment?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }
  const { action, comment } = body

  if (action !== 'submit' && action !== 'approve' && action !== 'reject' && action !== 'ack') {
    return NextResponse.json({ error: t('procurement.invalidAction') }, { status: 400 })
  }

  // Check AAL2 for approvals (same gate as leave approvals)
  if (action === 'approve' || action === 'reject') {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalData?.currentLevel !== 'aal2') {
      return NextResponse.json({ error: t('common.mfaRequired'), code: 'MFA_REQUIRED' }, { status: 403 })
    }
  }

  try {
    let result: Record<string, unknown>
    if (action === 'submit') {
      const r = await submitForApproval(docType, id, user.id)
      result = { ok: true, doc_no: r.docNo, step_count: r.stepCount }
    } else {
      const r = await actOnStep(docType, id, user.id, action, comment ?? null)
      result = { ok: true, status: r.docStatus, step_no: r.stepNo, finished: r.finished }
    }

    // Audit trail (procurement docs are not `documents` rows — doc reference goes in detail)
    await service.from('audit_logs').insert({
      doc_id: null,
      user_id: user.id,
      action: action === 'submit' ? 'upload' : action === 'reject' ? 'reject' : 'approve',
      detail: {
        scope: 'procurement_approval',
        doc_type: docType,
        doc_id: id,
        action,
        comment: comment ?? null,
      },
    })

    return NextResponse.json({ data: result })
  } catch (e) {
    if (e instanceof ApprovalEngineError) {
      const message = e.code === 'docNotFound'
        ? t('common.notFound')
        : t(`procurement.${e.code}` as Parameters<typeof t>[0])
      return NextResponse.json({ error: message }, { status: ERROR_STATUS[e.code] })
    }
    console.error('[procurement approvals] unexpected error:', e)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
}
