import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isValidDateString } from '@/lib/taipei-date'

async function canManageEvents(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('hr_manager')
}

// PATCH /api/calendar/events/[id]（admin / hr_manager）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  if (!(await canManageEvents(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()
  const invalid = () => NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  // 只允許白名單欄位，並比照 POST 驗證每個值（避免寫入空白 title / 非法日期 / 外洩 PG 錯誤）
  const updates: Record<string, unknown> = {}
  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim()) return invalid()
    updates.title = body.title.trim()
  }
  if ('description' in body) {
    updates.description = body.description || null
  }
  if ('start_date' in body) {
    if (!isValidDateString(body.start_date)) return invalid()
    updates.start_date = body.start_date
  }
  if ('end_date' in body) {
    if (!isValidDateString(body.end_date)) return invalid()
    updates.end_date = body.end_date
  }
  // 兩個日期同時更新時，維持 end >= start 不變式（僅其一時無法在不查現況下比對，交由 DB 約束）
  if (
    updates.start_date != null && updates.end_date != null &&
    (updates.end_date as string) < (updates.start_date as string)
  ) {
    return invalid()
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('company_events')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  if (!data) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  // 單向同步：內容已變（標題/日期/說明），對全體已連結者先刪後重推（best-effort）
  try {
    const { resyncCompanyEventToOutlook } = await import('@/lib/company-event-outlook')
    await resyncCompanyEventToOutlook(data)
  } catch (e) {
    console.warn('[calendar] company event Outlook resync failed:', e)
  }

  return NextResponse.json({ data })
}

// DELETE /api/calendar/events/[id] — 軟刪除（admin / hr_manager）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  if (!(await canManageEvents(supabase, user.id))) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('company_events')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  // 單向同步：從全體已連結者的 Outlook 刪除此活動並清紀錄（best-effort）
  try {
    const { removeCompanyEventFromOutlook } = await import('@/lib/company-event-outlook')
    await removeCompanyEventFromOutlook(id)
  } catch (e) {
    console.warn('[calendar] company event Outlook cleanup failed:', e)
  }

  return NextResponse.json({ data: null })
}
