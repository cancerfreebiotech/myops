import { createServiceClient } from '@/lib/supabase/server'

// T65: Bot Framework utility functions (no botbuilder SDK — direct REST calls)
//
// getBotToken()            — client-credentials token for the Bot Framework API,
//                            cached at module level until ~5 minutes before expiry
// sendProactiveMessage()   — look up the user's conversation reference and send a
//                            proactive Teams message; skip + log when missing, never throw
// sendProactiveMessages()  — sequential batch send with per-item error isolation

const TOKEN_URL =
  'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token'
const TOKEN_SCOPE = 'https://api.botframework.com/.default'

// Refresh this long (ms) before the token actually expires
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000

let cachedToken: { token: string; expiresAt: number } | null = null

export async function getBotToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return cachedToken.token
  }

  const appId = process.env.TEAMS_BOT_APP_ID
  const appSecret = process.env.TEAMS_BOT_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('TEAMS_BOT_APP_ID / TEAMS_BOT_APP_SECRET not configured')
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: appId,
      client_secret: appSecret,
      scope: TOKEN_SCOPE,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Bot token request failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.token
}

export async function sendProactiveMessage(
  userId: string,
  text: string
): Promise<boolean> {
  try {
    const service = await createServiceClient()
    const { data: ref, error } = await service
      .from('teams_conversation_references')
      .select('service_url, conversation_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error(`[teams-bot] reference lookup failed for ${userId}:`, error.message)
      return false
    }
    if (!ref) {
      console.log(`[teams-bot] no conversation reference for user ${userId}, skipping`)
      return false
    }

    const token = await getBotToken()
    const serviceUrl = (ref.service_url as string).replace(/\/+$/, '')
    const url = `${serviceUrl}/v3/conversations/${encodeURIComponent(ref.conversation_id as string)}/activities`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'message', text }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[teams-bot] send failed for ${userId} (${res.status}): ${body}`)
      return false
    }

    return true
  } catch (e) {
    console.error(`[teams-bot] send error for ${userId}:`, e)
    return false
  }
}

export async function sendProactiveMessages(
  messages: { userId: string; text: string }[]
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
