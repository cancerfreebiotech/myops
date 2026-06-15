import { createServiceClient } from '@/lib/supabase/server'

// Dr.Ave gateway client (T8). myOPS no longer talks to the Bot Framework directly —
// the shared Dr.Ave gateway (FlightPath) owns the Azure bot, conversation
// references and JWT verification. We just POST notifications / actionable cards
// to Dr.Ave's /api/notify and let it route to Teams.
//
// Contract (POST ${DRAVA_NOTIFY_URL}, Authorization: Bearer ${DRAVA_NOTIFY_API_KEY}):
//   body { to: email, source: 'myops', message?: string, card?: DravaCard }
//   → { ok: true, method: 'teams' | 'skipped' }
//   method === 'skipped' = recipient has no conversation reference (never DM'd
//   DrAva yet) → graceful degrade, NOT an error, NOT counted as sent.
//
// Recipients are identified by EMAIL, not myOPS user_id — callers still pass a
// myOPS userId, we resolve it to users.email via the service client.
//
// Public surface (unchanged signatures so callers don't churn):
//   sendProactiveMessage(userId, text)        → boolean (delivered?)
//   sendProactiveMessages(msgs)               → { sent, failed }
//   sendProactiveCard(userId, card)           → boolean (delivered?)

export interface DravaCardAction {
  label: string
  action_type: string
  payload: Record<string, unknown>
  style?: string
}

export interface DravaCard {
  title: string
  body: string
  actions: DravaCardAction[]
}

interface NotifyResponse {
  ok: boolean
  method?: 'teams' | 'skipped'
}

/** Resolve a myOPS user_id to the email Dr.Ave identifies recipients by. */
async function resolveEmail(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await service
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error(`[teams-bot] email lookup failed for ${userId}:`, error.message)
    return null
  }
  return (data?.email as string | undefined) ?? null
}

/**
 * POST a notification (text and/or card) to Dr.Ave for one recipient email.
 * Returns true only when Dr.Ave actually delivered (method === 'teams').
 * method === 'skipped' (no conversation ref) returns false but is not an error.
 * Never throws.
 */
async function postNotify(
  email: string,
  payload: { message?: string; card?: DravaCard },
): Promise<boolean> {
  const url = process.env.DRAVA_NOTIFY_URL
  const apiKey = process.env.DRAVA_NOTIFY_API_KEY
  if (!url || !apiKey) {
    console.error('[teams-bot] DRAVA_NOTIFY_URL / DRAVA_NOTIFY_API_KEY not configured')
    return false
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: email, source: 'myops', ...payload }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[teams-bot] Dr.Ave notify failed for ${email} (${res.status}): ${body}`)
      return false
    }

    const data = (await res.json().catch(() => null)) as NotifyResponse | null
    if (!data?.ok) {
      console.error(`[teams-bot] Dr.Ave notify returned not-ok for ${email}`)
      return false
    }
    if (data.method === 'skipped') {
      console.log(`[teams-bot] Dr.Ave skipped ${email} (no conversation reference)`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[teams-bot] Dr.Ave notify error for ${email}:`, e)
    return false
  }
}

export async function sendProactiveMessage(
  userId: string,
  text: string,
): Promise<boolean> {
  const service = await createServiceClient()
  const email = await resolveEmail(service, userId)
  if (!email) {
    console.log(`[teams-bot] no email for user ${userId}, skipping`)
    return false
  }
  return postNotify(email, { message: text })
}

export async function sendProactiveMessages(
  messages: { userId: string; text: string }[],
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (const m of messages) {
    // sendProactiveMessage never throws — per-item isolation is built in
    const ok = await sendProactiveMessage(m.userId, m.text)
    if (ok) sent++
    else failed++
  }

  return { sent, failed }
}

export async function sendProactiveCard(
  userId: string,
  card: DravaCard,
): Promise<boolean> {
  const service = await createServiceClient()
  const email = await resolveEmail(service, userId)
  if (!email) {
    console.log(`[teams-bot] no email for user ${userId}, skipping card`)
    return false
  }
  return postNotify(email, { card })
}
