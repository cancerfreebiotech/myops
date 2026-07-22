import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

const VALID_STATUSES = ['attending', 'declined', 'maybe'] as const
type RsvpStatus = (typeof VALID_STATUSES)[number]

// PUT /api/calendar/events/[id]/rsvp { status: 'attending' | 'declined' | 'maybe' }
// 本人寫自己的出席回覆。createServiceClient 帶使用者 JWT 走 RLS：
// company_event_rsvps 的 INSERT/UPDATE 政策限制 user_id = auth.uid()。
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  let status: unknown
  try {
    status = (await request.json())?.status
  } catch {
    status = null
  }
  if (!VALID_STATUSES.includes(status as RsvpStatus)) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const service = await createServiceClient()

  // 活動需存在且未刪除（一般使用者的 SELECT 政策本就只回未刪除者）
  const { data: event } = await service
    .from('company_events')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!event) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const { data, error } = await service
    .from('company_event_rsvps')
    .upsert(
      { event_id: id, user_id: user.id, status: status as RsvpStatus },
      { onConflict: 'event_id,user_id' },
    )
    .select('event_id, user_id, status')
    .single()
  if (error) {
    console.error('[calendar] rsvp upsert failed:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  return NextResponse.json({ data })
}
