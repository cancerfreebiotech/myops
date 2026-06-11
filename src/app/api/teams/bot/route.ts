import { NextRequest, NextResponse } from 'next/server'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { createServiceClient } from '@/lib/supabase/server'
import { getBotToken } from '@/lib/teams-bot'

// T66: Bot Framework webhook endpoint
// - Validates the incoming Bot Framework JWT (signature + audience + issuer)
// - conversationUpdate → resolves the Teams member's email and stores the
//   conversation reference (teams_conversation_references, unique per user)
// - message → replies with a short trilingual help text
// - Always returns 200 to acknowledge, except on auth failure (401)

const OPENID_CONFIG_URL =
  'https://login.botframework.com/v1/.well-known/openidconfiguration'
const BOT_FRAMEWORK_ISSUER = 'https://api.botframework.com'

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

async function getJwks() {
  if (jwks) return jwks
  const res = await fetch(OPENID_CONFIG_URL)
  if (!res.ok) throw new Error(`OpenID config fetch failed (${res.status})`)
  const config = (await res.json()) as { jwks_uri: string }
  jwks = createRemoteJWKSet(new URL(config.jwks_uri))
  return jwks
}

async function verifyBotFrameworkToken(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice('Bearer '.length)
  const appId = process.env.TEAMS_BOT_APP_ID
  if (!appId) return false

  try {
    const keySet = await getJwks()
    await jwtVerify(token, keySet, {
      issuer: BOT_FRAMEWORK_ISSUER,
      audience: appId,
    })
    return true
  } catch (e) {
    console.error('[teams-bot] JWT verification failed:', e)
    return false
  }
}

interface BotActivity {
  type?: string
  serviceUrl?: string
  channelId?: string
  conversation?: { id?: string; tenantId?: string }
  from?: { id?: string; aadObjectId?: string }
  recipient?: { id?: string }
  membersAdded?: { id?: string; aadObjectId?: string }[]
}

interface TeamsMember {
  id?: string
  email?: string
  userPrincipalName?: string
  aadObjectId?: string
}

const HELP_TEXT = [
  '👋 我是 myOPS 通知小幫手。我會在這裡推送你的請假審核結果、薪資單、公告與打卡提醒。前往 myOPS：https://ops.cancerfree.io',
  "👋 I'm the myOPS notification bot. I'll send you leave approval results, payslip alerts, announcements, and clock-in reminders here. Visit myOPS: https://ops.cancerfree.io",
  '👋 myOPS 通知ボットです。休暇承認の結果、給与明細、お知らせ、打刻リマインダーをここにお届けします。myOPS はこちら：https://ops.cancerfree.io',
].join('\n\n')

async function fetchMemberDetail(
  serviceUrl: string,
  conversationId: string,
  memberId: string
): Promise<TeamsMember | null> {
  try {
    const token = await getBotToken()
    const base = serviceUrl.replace(/\/+$/, '')
    const res = await fetch(
      `${base}/v3/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(memberId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) {
      console.error(`[teams-bot] member detail fetch failed (${res.status}) for ${memberId}`)
      return null
    }
    return (await res.json()) as TeamsMember
  } catch (e) {
    console.error('[teams-bot] member detail fetch error:', e)
    return null
  }
}

async function handleConversationUpdate(activity: BotActivity) {
  const serviceUrl = activity.serviceUrl
  const conversationId = activity.conversation?.id
  if (!serviceUrl || !conversationId) return

  const botId = activity.recipient?.id
  const botAppId = process.env.TEAMS_BOT_APP_ID
  const members = (activity.membersAdded ?? []).filter(
    (m) => m.id && m.id !== botId && !(botAppId && m.id.includes(botAppId))
  )
  if (!members.length) return

  const service = await createServiceClient()

  for (const member of members) {
    const detail = await fetchMemberDetail(serviceUrl, conversationId, member.id!)
    const email = (detail?.email || detail?.userPrincipalName || '').toLowerCase()
    if (!email) {
      console.log(`[teams-bot] no email for Teams member ${member.id}, skipping`)
      continue
    }

    const { data: user } = await service
      .from('users')
      .select('id')
      .ilike('email', email)
      .maybeSingle()

    if (!user) {
      console.log(`[teams-bot] no myOPS user matches Teams email ${email}, skipping`)
      continue
    }

    const { error } = await service
      .from('teams_conversation_references')
      .upsert(
        {
          user_id: user.id,
          teams_user_id: member.id!,
          service_url: serviceUrl,
          conversation_id: conversationId,
          channel_id: activity.channelId ?? 'msteams',
          tenant_id: activity.conversation?.tenantId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error(`[teams-bot] upsert reference failed for ${email}:`, error.message)
    } else {
      console.log(`[teams-bot] conversation reference saved for ${email}`)
    }
  }
}

async function handleMessage(activity: BotActivity) {
  const serviceUrl = activity.serviceUrl
  const conversationId = activity.conversation?.id
  if (!serviceUrl || !conversationId) return

  try {
    const token = await getBotToken()
    const base = serviceUrl.replace(/\/+$/, '')
    const res = await fetch(
      `${base}/v3/conversations/${encodeURIComponent(conversationId)}/activities`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'message', text: HELP_TEXT }),
      }
    )
    if (!res.ok) {
      console.error(`[teams-bot] help reply failed (${res.status})`)
    }
  } catch (e) {
    console.error('[teams-bot] help reply error:', e)
  }

  // A direct message also establishes a usable conversation reference —
  // capture it so proactive messaging works even without a conversationUpdate.
  if (activity.from?.id) {
    await handleConversationUpdate({
      ...activity,
      membersAdded: [{ id: activity.from.id, aadObjectId: activity.from.aadObjectId }],
    })
  }
}

export async function POST(request: NextRequest) {
  const isValid = await verifyBotFrameworkToken(request.headers.get('authorization'))
  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let activity: BotActivity
  try {
    activity = (await request.json()) as BotActivity
  } catch {
    // Malformed body — acknowledge anyway per Bot Framework expectations
    return NextResponse.json({}, { status: 200 })
  }

  try {
    if (activity.type === 'conversationUpdate') {
      await handleConversationUpdate(activity)
    } else if (activity.type === 'message') {
      await handleMessage(activity)
    }
  } catch (e) {
    // Never bubble errors to Teams — log and acknowledge
    console.error('[teams-bot] activity handling error:', e)
  }

  return NextResponse.json({}, { status: 200 })
}
