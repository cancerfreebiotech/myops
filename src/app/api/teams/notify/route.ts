import { NextRequest, NextResponse } from 'next/server'

// T56: Teams Bot instant notification
// Called internally when important events happen (approval results, urgent announcements, payslips)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { user_email, message, type } = body

  if (!user_email || !message) {
    return NextResponse.json({ error: 'Missing user_email or message' }, { status: 400 })
  }

  const botAppId = process.env.TEAMS_BOT_APP_ID
  const botAppSecret = process.env.TEAMS_BOT_APP_SECRET

  if (!botAppId || !botAppSecret) {
    return NextResponse.json({ error: 'Teams Bot not configured' }, { status: 500 })
  }

  // TODO: Implement Teams Bot Framework proactive messaging
  // This requires:
  // 1. Getting a Bot Framework token from Microsoft
  // 2. Looking up the user's conversation reference (stored when they first interact with the bot)
  // 3. Sending a proactive message via the Bot Framework API
  //
  // For now, log the notification
  console.log(`[Teams Notify] To: ${user_email} | Type: ${type} | Message: ${message}`)

  return NextResponse.json({ data: { sent: true, method: 'logged' } })
}
