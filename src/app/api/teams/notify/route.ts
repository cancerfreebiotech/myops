import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendProactiveMessage } from '@/lib/teams-bot'

// T69: Teams Bot instant notification
// Called internally when important events happen (approval results, urgent announcements, payslips)
// Body: { user_id: string, message: string, type?: 'leave' | 'payroll' | 'announcement' | 'contract' }
// Backward compat: user_email is accepted and resolved to users.id via the service client.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  // Fail closed: without CRON_SECRET configured, the endpoint is disabled
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { user_id?: string; user_email?: string; message?: string; type?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { user_email, message, type } = body
  let userId = body.user_id

  if ((!userId && !user_email) || !message) {
    return NextResponse.json({ error: 'Missing user_id or message' }, { status: 400 })
  }

  // Backward compat: resolve user_email -> users.id
  if (!userId && user_email) {
    const service = await createServiceClient()
    const { data: user, error } = await service
      .from('users')
      .select('id')
      .eq('email', user_email)
      .maybeSingle()

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    userId = user.id as string
  }

  if (type) {
    console.log(`[Teams Notify] To: ${userId} | Type: ${type}`)
  }

  // sendProactiveMessage never throws — failures are logged and reported as sent: false
  const sent = await sendProactiveMessage(userId!, message)

  return NextResponse.json({ sent })
}
