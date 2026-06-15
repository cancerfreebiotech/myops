import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import {
  ApprovalEngineError,
  actOnStep,
} from '@/lib/procurement/approval-engine'
import { DOC_AMOUNT_FIELD, DOC_TYPE_META, isDocType, type DocType } from '@/lib/procurement/doc-types'
import { getBotApprovalPolicy, shouldOneTap } from '@/lib/bot-approval-policy'

// Bot-facing approval endpoint (T8). Called by Dr.Ave (NOT a user session) when a
// Teams card approve/reject button is tapped. Authenticated with the shared
// Bearer ${BOT_GATEWAY_TOKEN}; the acting user is identified by `email`.
//
// POST { email, docType, docId, stepNo, action: 'approve' | 'reject', comment? }
//
// Defense in depth: even though the card was built with shouldOneTap(), we
// re-evaluate the policy here against the live document amount before acting, so
// a card minted before a policy change can't smuggle a one-tap through. When the
// document is no longer eligible for one-tap we refuse with { ok:false,
// reason:'use_web' } and the user must approve on the web (MFA preserved).
//
// On success we mark the audit_logs row via='teams_one_tap'.

// The amount column per doc type comes from the shared DOC_AMOUNT_FIELD map (the
// single source of truth shared with approval-engine's card build and the
// admin policy UI). docTypes without a money amount map to undefined (→ amount
// undefined → thresholded one-tap refused, unthresholded one-tap allowed).
// Using the same map guarantees the card-build vs re-validate decision can never
// diverge for a given doc type.
function resolveAmount(docType: DocType, doc: Record<string, unknown>): number | undefined {
  const field = DOC_AMOUNT_FIELD[docType]
  if (!field) return undefined
  const v = doc[field]
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')

  // Bearer BOT_GATEWAY_TOKEN — not a user session.
  const token = process.env.BOT_GATEWAY_TOKEN
  const authHeader = request.headers.get('authorization')
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ ok: false, message: t('common.unauthorized') }, { status: 401 })
  }

  let body: {
    email?: string
    docType?: string
    docId?: string
    stepNo?: number
    action?: string
    comment?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: t('common.invalidRequest') }, { status: 400 })
  }

  const { email, docType, docId, stepNo, action, comment } = body

  if (!email || !docType || !docId || stepNo === undefined || !action) {
    return NextResponse.json({ ok: false, message: t('common.missingFields') }, { status: 400 })
  }
  if (!isDocType(docType)) {
    return NextResponse.json({ ok: false, message: t('procurement.invalidDocType') }, { status: 400 })
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ ok: false, message: t('procurement.invalidAction') }, { status: 400 })
  }

  const service = await createServiceClient()

  // email → user identity
  const { data: userRow } = await service
    .from('users')
    .select('id, is_active')
    .eq('email', email)
    .maybeSingle()
  if (!userRow || userRow.is_active === false) {
    return NextResponse.json({ ok: false, message: t('common.unauthorized') }, { status: 401 })
  }
  const userId = userRow.id as string

  // Re-validate one-tap eligibility against the LIVE document + current policy.
  // approve uses one-tap; reject is always a safe action so it bypasses the gate.
  if (action === 'approve') {
    const { data: doc } = await service
      .from(DOC_TYPE_META[docType].table)
      .select('*')
      .eq('id', docId)
      .maybeSingle()
    if (!doc) {
      return NextResponse.json({ ok: false, message: t('common.notFound') }, { status: 404 })
    }
    const policy = await getBotApprovalPolicy()
    const amount = resolveAmount(docType, doc as Record<string, unknown>)
    if (!shouldOneTap(policy, docType, amount)) {
      // Policy no longer permits one-tap for this document → fall back to web.
      return NextResponse.json({ ok: false, reason: 'use_web' })
    }
  }

  try {
    const r = await actOnStep(docType, docId, userId, action, comment ?? null)

    await service.from('audit_logs').insert({
      doc_id: null,
      user_id: userId,
      action: action === 'reject' ? 'reject' : 'approve',
      detail: {
        scope: 'procurement_approval',
        doc_type: docType,
        doc_id: docId,
        step_no: stepNo,
        action,
        comment: comment ?? null,
        via: 'teams_one_tap',
      },
    })

    const message = action === 'reject'
      ? t('botApprove.rejected')
      : r.finished
        ? t('botApprove.approvedFinal')
        : t('botApprove.approvedAdvanced')

    return NextResponse.json({ ok: true, status: r.docStatus, message })
  } catch (e) {
    if (e instanceof ApprovalEngineError) {
      const message = e.code === 'docNotFound'
        ? t('common.notFound')
        : t(`procurement.${e.code}` as Parameters<typeof t>[0])
      return NextResponse.json({ ok: false, message })
    }
    console.error('[bot/approve] unexpected error:', e)
    return NextResponse.json({ ok: false, message: t('common.serverError') }, { status: 500 })
  }
}
