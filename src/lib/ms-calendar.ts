import { createAdminClient } from '@/lib/supabase/server'

// Outlook 單向同步：以「當事人身分」在其 Outlook 行事曆建立/刪除事件。
// 用當事人於登入時儲存的 refresh token 換取 access token（AAD v2 token endpoint）。
// 全部 best-effort：任何失敗只記 log、回傳 null，絕不影響呼叫端（核准流程）。

const TOKEN_URL = () =>
  `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`

/** 登入 callback 擷取到 provider_refresh_token 時呼叫，存入 user_ms_tokens。 */
export async function storeMsRefreshToken(userId: string, refreshToken: string): Promise<void> {
  if (!refreshToken) return
  const admin = createAdminClient()
  await admin.from('user_ms_tokens').upsert(
    { user_id: userId, refresh_token: refreshToken, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
}

/** 以儲存的 refresh token 換一個新的 access token；順帶更新輪替後的 refresh token。 */
async function getAccessToken(userId: string): Promise<string | null> {
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('user_ms_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle()
  if (!row?.refresh_token) return null

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
    scope: 'openid profile email offline_access Calendars.ReadWrite',
  })

  try {
    const res = await fetch(TOKEN_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    if (!res.ok) {
      console.error('[ms-calendar] token refresh failed:', res.status, await res.text().catch(() => ''))
      return null
    }
    const json = await res.json() as { access_token?: string; refresh_token?: string }
    // AAD 會輪替 refresh token — 存回新的以免下次失效
    if (json.refresh_token && json.refresh_token !== row.refresh_token) {
      await admin.from('user_ms_tokens')
        .update({ refresh_token: json.refresh_token, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    }
    return json.access_token ?? null
  } catch (e) {
    console.error('[ms-calendar] token refresh error:', e)
    return null
  }
}

export interface OutlookEventInput {
  subject: string
  startDate: string // YYYY-MM-DD（起始日，含當日）
  endDate: string   // YYYY-MM-DD（結束日，含當日）
  /** Graph 的 showAs；未指定時維持 'oof'（既有請假/出差呼叫端行為不變）。 */
  showAs?: 'free' | 'tentative' | 'busy' | 'oof'
  /** 事件內文（純文字）；未指定時不帶 body。 */
  bodyText?: string
}

/**
 * YYYY-MM-DD 加一天，回傳 YYYY-MM-DD。
 * Graph all-day 事件的 end 是「排他邊界」，須為結束日隔天 00:00，故結束日 +1。
 * 以 UTC 解析避免本機時區位移；日期字串本身不帶時區，加一天不受夏令時間影響。
 */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * 在 userId 的 Outlook 建立 all-day 事件（預設 showAs=oof），回傳 event id（失敗回 null）。
 * 請假/出差：userId 為當事人（申請人），非核准者。公司活動：逐一推給每位已連結者（showAs=free）。
 */
export async function pushOutlookEvent(userId: string, input: OutlookEventInput): Promise<string | null> {
  const token = await getAccessToken(userId)
  if (!token) return null
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: input.subject,
        showAs: input.showAs ?? 'oof',
        ...(input.bodyText ? { body: { contentType: 'text', content: input.bodyText } } : {}),
        isAllDay: true,
        // all-day 事件 start/end 皆須為午夜；end 為結束日隔天 00:00（排他邊界）
        start: { dateTime: `${input.startDate}T00:00:00`, timeZone: 'Asia/Taipei' },
        end: { dateTime: `${nextDay(input.endDate)}T00:00:00`, timeZone: 'Asia/Taipei' },
      }),
    })
    if (!res.ok) {
      console.error('[ms-calendar] create event failed:', res.status, await res.text().catch(() => ''))
      return null
    }
    const ev = await res.json() as { id?: string }
    return ev.id ?? null
  } catch (e) {
    console.error('[ms-calendar] create event error:', e)
    return null
  }
}

/** 刪除 userId Outlook 的事件（請假/出差被取消或退回時）。best-effort。 */
export async function deleteOutlookEvent(userId: string, eventId: string): Promise<boolean> {
  if (!eventId) return true
  const token = await getAccessToken(userId)
  if (!token) return false
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    // 404 = 事件已不存在，視為刪除成功
    return res.ok || res.status === 404
  } catch (e) {
    console.error('[ms-calendar] delete event error:', e)
    return false
  }
}

/** 該使用者是否已連結 Outlook（登入時存過 refresh token）。 */
export async function isMsConnected(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.from('user_ms_tokens').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}
