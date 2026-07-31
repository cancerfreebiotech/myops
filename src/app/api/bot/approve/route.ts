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
// 兩種 body 形狀都收（見 normalizeCallback）：
//   Dr.Ave 轉發：{ actionType, payload: { docType, docId, stepNo, action }, actor: { email } }
//   PRD §4.3 扁平：{ email, docType, docId, stepNo, action: 'approve' | 'reject', comment? }
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

interface BotCallback {
  email?: string
  docType?: string
  docId?: string
  stepNo?: number
  action?: string
  comment?: string
}

/**
 * Dr.Ave 的轉發格式是 `{ actionType, payload, actor: { email, name } }`
 * ——camelCase，payload 原樣回送我們發卡時塞的內容（Dr.Ave 2026-07-31 回覆確認）。
 * 我們發卡時的 payload 就是 { docType, docId, stepNo, action }（見 lib/drava-card.ts），
 * 所以簽核所需欄位都在裡面，唯獨點擊者身分要取 `actor.email`。
 *
 * PRD §4.3 的扁平形狀 `{ email, docType, ... }` 一併保留：Dr.Ave 若回退舊版
 * 或有其他呼叫端直打都不會壞。判斷依據是有沒有 `payload` 物件，而不是有沒有
 * `actionType`——避免將來對方只送其中一個欄位時解析錯邊。
 */
function normalizeCallback(raw: Record<string, unknown>): BotCallback {
  const payload = raw.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return raw as BotCallback
  }
  const p = payload as Record<string, unknown>
  const actor = (raw.actor && typeof raw.actor === 'object' ? raw.actor : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : undefined)
  const stepNo = Number(p.stepNo)
  return {
    // 身分只認 actor.email（Dr.Ave 端認證過的點擊者）。payload 是我們自己塞進卡片的，
    // 若日後有人在 payload 放 email，不能讓它蓋掉真正的點擊者。
    email: str(actor.email),
    docType: str(p.docType),
    docId: str(p.docId),
    stepNo: Number.isFinite(stepNo) ? stepNo : undefined,
    action: str(p.action),
    comment: str(p.comment),
  }
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')

  // Bearer BOT_GATEWAY_TOKEN — not a user session.
  const token = process.env.BOT_GATEWAY_TOKEN
  const authHeader = request.headers.get('authorization')
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ ok: false, message: t('common.unauthorized') }, { status: 401 })
  }

  let raw: Record<string, unknown>
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: t('common.invalidRequest') }, { status: 400 })
  }

  // 記下實際收到的形狀（不含內容）：Dr.Ave 的轉發格式是外部契約，會漂移。
  const rawActionType = typeof raw.actionType === 'string' ? raw.actionType : null
  console.log(`[bot/approve] callback keys=${Object.keys(raw).join(',')} actionType=${rawActionType ?? '(flat)'}`)

  // open_url 之類的按鈕不是簽核動作。明確回報，不要讓它掉進下面的 missingFields
  // （那個訊息會讓人以為是格式壞掉）。
  if (rawActionType && rawActionType !== 'approve_doc') {
    return NextResponse.json({ ok: false, reason: 'unsupported_action', actionType: rawActionType }, { status: 400 })
  }

  const { email, docType, docId, stepNo, action, comment } = normalizeCallback(raw)

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
