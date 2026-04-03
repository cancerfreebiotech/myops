import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// T54: Delete Outlook Calendar event when leave is cancelled
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { session } } = await supabase.auth.getSession()
  const providerToken = session?.provider_token

  if (!providerToken) {
    return NextResponse.json({
      error: 'Microsoft access token not available. Please re-login.',
    }, { status: 401 })
  }

  try {
    const graphRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${providerToken}` },
      }
    )

    if (!graphRes.ok && graphRes.status !== 404) {
      return NextResponse.json({
        error: `Failed to delete calendar event: ${graphRes.statusText}`,
      }, { status: graphRes.status })
    }

    return NextResponse.json({ data: { deleted: true } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
