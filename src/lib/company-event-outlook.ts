import { createAdminClient } from '@/lib/supabase/server'
import { pushOutlookEvent, deleteOutlookEvent } from '@/lib/ms-calendar'

// 公司活動 → 全員 Outlook 單向同步。
// 推送對象：所有 active 使用者中已連結 Microsoft（user_ms_tokens 有列）者。
// 成功推送的 ms_event_id 記入 company_event_outlook_pushes（service-role 專用表），
// 供活動刪除/更新時清理。全部 best-effort：任何失敗只 console.warn，
// 絕不影響活動的建立/更新/刪除流程（呼叫端仍應以 try/catch 包住）。

export interface CompanyEventForSync {
  id: string
  title: string
  description: string | null
  start_date: string
  end_date: string
}

/** 活動建立（或重推）時：逐一推全天活動到每位已連結者的 Outlook。 */
export async function pushCompanyEventToOutlook(event: CompanyEventForSync): Promise<void> {
  const admin = createAdminClient()

  const { data: tokenRows, error: tokenErr } = await admin
    .from('user_ms_tokens')
    .select('user_id')
  if (tokenErr) {
    console.warn('[company-event-outlook] load tokens failed:', tokenErr.message)
    return
  }
  if (!tokenRows?.length) return

  const { data: activeUsers, error: userErr } = await admin
    .from('users')
    .select('id')
    .eq('is_active', true)
    .in('id', tokenRows.map(r => r.user_id))
  if (userErr) {
    console.warn('[company-event-outlook] load users failed:', userErr.message)
    return
  }

  for (const u of activeUsers ?? []) {
    try {
      const msEventId = await pushOutlookEvent(u.id, {
        subject: event.title,
        startDate: event.start_date,
        endDate: event.end_date,
        showAs: 'free', // 公司活動不佔用個人 availability
        bodyText: event.description ?? undefined,
      })
      if (!msEventId) continue
      const { error } = await admin.from('company_event_outlook_pushes').upsert(
        { event_id: event.id, user_id: u.id, ms_event_id: msEventId },
        { onConflict: 'event_id,user_id' },
      )
      if (error) {
        console.warn('[company-event-outlook] record push failed:', event.id, u.id, error.message)
      }
    } catch (e) {
      console.warn('[company-event-outlook] push failed:', event.id, u.id, e)
    }
  }
}

/** 活動刪除時：讀 pushes 逐一刪除 Outlook 事件並清列。 */
export async function removeCompanyEventFromOutlook(eventId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: pushes, error } = await admin
    .from('company_event_outlook_pushes')
    .select('user_id, ms_event_id')
    .eq('event_id', eventId)
  if (error) {
    console.warn('[company-event-outlook] load pushes failed:', eventId, error.message)
    return
  }

  for (const p of pushes ?? []) {
    try {
      // 遠端刪除確認成功（含 404=已不存在）才清 push 列；
      // 失敗時保留列，讓之後的 resync/刪除重試有機會清掉孤兒事件
      const removed = await deleteOutlookEvent(p.user_id, p.ms_event_id)
      if (!removed) {
        console.warn('[company-event-outlook] remote delete failed, keeping push row:', eventId, p.user_id)
        continue
      }
      const { error: delErr } = await admin
        .from('company_event_outlook_pushes')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', p.user_id)
      if (delErr) {
        console.warn('[company-event-outlook] clear push row failed:', eventId, p.user_id, delErr.message)
      }
    } catch (e) {
      console.warn('[company-event-outlook] delete failed:', eventId, p.user_id, e)
    }
  }
}

/** 活動更新時：先刪後推（標題/日期/說明可能已變）。 */
export async function resyncCompanyEventToOutlook(event: CompanyEventForSync): Promise<void> {
  await removeCompanyEventFromOutlook(event.id)
  await pushCompanyEventToOutlook(event)
}
