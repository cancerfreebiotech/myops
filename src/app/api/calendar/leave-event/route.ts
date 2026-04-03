import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// T53: Create Outlook Calendar event for approved leave
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { leave_request_id, subject, start_date, end_date, is_all_day } = body

  if (!leave_request_id || !subject || !start_date || !end_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Get the user's Microsoft access token from Supabase Auth session
  const { data: { session } } = await supabase.auth.getSession()
  const providerToken = session?.provider_token

  if (!providerToken) {
    return NextResponse.json({
      error: 'Microsoft access token not available. Please re-login.',
    }, { status: 401 })
  }

  try {
    const eventBody: any = {
      subject,
      showAs: 'oof', // Out of Office
      isAllDay: is_all_day ?? true,
      start: {
        dateTime: `${start_date}T00:00:00`,
        timeZone: 'Asia/Taipei',
      },
      end: {
        dateTime: `${end_date}T23:59:59`,
        timeZone: 'Asia/Taipei',
      },
    }

    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${providerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    })

    if (!graphRes.ok) {
      const err = await graphRes.json().catch(() => ({}))
      return NextResponse.json({
        error: `Calendar event creation failed: ${err?.error?.message ?? graphRes.statusText}`,
      }, { status: graphRes.status })
    }

    const event = await graphRes.json()

    // Save event ID to leave_request — verify ownership
    const { createServiceClient } = await import('@/lib/supabase/server')
    const service = await createServiceClient()
    await service
      .from('leave_requests')
      .update({ outlook_event_id: event.id })
      .eq('id', leave_request_id)
      .eq('user_id', user.id)

    return NextResponse.json({ data: { event_id: event.id } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
