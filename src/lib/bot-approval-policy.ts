// Server-only: Teams 一鍵直簽 policy (PRD §4).
//
// myOPS rule: all approvals require AAL2 (MFA). Teams card buttons can't run MFA.
// Default is deep-link (preserve MFA); admins may open per-docType "one-tap"
// approval, with an optional amount threshold for money documents.
//
// Stored in system_settings under key 'bot_approval_policy' as a JSON string,
// following the same read/write style as feature-flags.ts / admin/settings.

import { createServiceClient } from '@/lib/supabase/server'
import { DOC_TYPES, type DocType } from '@/lib/procurement/doc-types'

const POLICY_KEY = 'bot_approval_policy'

export interface BotApprovalDocPolicy {
  /** allow Teams one-tap approval (default false → deep link) */
  one_tap: boolean
  /** money documents: only allow one-tap when amount < threshold */
  amount_threshold?: number
}

export type BotApprovalPolicy = Record<DocType, BotApprovalDocPolicy>

/** Default policy: every docType deep-links (one_tap=false) — safest start. */
export function defaultBotApprovalPolicy(): BotApprovalPolicy {
  return Object.fromEntries(
    DOC_TYPES.map(dt => [dt, { one_tap: false }]),
  ) as BotApprovalPolicy
}

/**
 * Read the bot approval policy from system_settings. Missing key, malformed
 * JSON, or unknown docTypes fall back to the all-deep-link default. Each known
 * docType is always present in the returned object.
 */
export async function getBotApprovalPolicy(): Promise<BotApprovalPolicy> {
  const policy = defaultBotApprovalPolicy()

  const service = await createServiceClient()
  const { data } = await service
    .from('system_settings')
    .select('value')
    .eq('key', POLICY_KEY)
    .maybeSingle()

  const raw = data?.value as string | undefined
  if (!raw) return policy

  let parsed: unknown
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    console.error('[bot-approval-policy] malformed bot_approval_policy JSON, using default')
    return policy
  }
  if (!parsed || typeof parsed !== 'object') return policy

  for (const dt of DOC_TYPES) {
    const entry = (parsed as Record<string, unknown>)[dt]
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    policy[dt] = {
      one_tap: e.one_tap === true,
      ...(typeof e.amount_threshold === 'number'
        ? { amount_threshold: e.amount_threshold }
        : {}),
    }
  }

  return policy
}

/**
 * Decide whether a document should get a one-tap card.
 * True only when the docType has one_tap enabled AND (no threshold OR the
 * amount is below the threshold). An undefined amount on a threshold'd docType
 * is treated as not eligible (can't prove it's below the limit).
 */
export function shouldOneTap(
  policy: BotApprovalPolicy,
  docType: DocType,
  amount?: number,
): boolean {
  const p = policy[docType]
  if (!p || !p.one_tap) return false
  if (p.amount_threshold === undefined) return true
  if (amount === undefined) return false
  return amount < p.amount_threshold
}
