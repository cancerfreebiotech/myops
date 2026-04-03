import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// T55: Teams Bot daily digest — called by cron at 08:30
// Sends a summary of pending items to each user via Teams
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  // Verify cron or admin
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Fallback: check user auth
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (data?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = await createServiceClient()

  // Get all active users
  const { data: users } = await service
    .from('users')
    .select('id, display_name, email, language')
    .eq('is_active', true)

  if (!users?.length) return NextResponse.json({ data: { sent: 0 } })

  const botAppId = process.env.TEAMS_BOT_APP_ID
  const botAppSecret = process.env.TEAMS_BOT_APP_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ops.cancerfree.io'

  if (!botAppId || !botAppSecret) {
    return NextResponse.json({ error: 'Teams Bot not configured' }, { status: 500 })
  }

  let sent = 0

  for (const u of users) {
    // Get pending items for this user
    const [leaveRes, contractRes, announcementRes] = await Promise.all([
      // Pending leave approvals (where user is the approver)
      service
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      // Pending contracts
      service
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .in('doc_type', ['NDA', 'MOU', 'CONTRACT', 'AMEND'])
        .is('deleted_at', null),
      // Unconfirmed announcements
      service
        .from('document_recipients')
        .select('document_id', { count: 'exact', head: true })
        .eq('user_id', u.id),
    ])

    const pendingLeaves = leaveRes.count ?? 0
    const pendingContracts = contractRes.count ?? 0
    const totalPending = pendingLeaves + pendingContracts

    if (totalPending === 0) continue

    // Build message
    const lines: string[] = []
    lines.push(`📋 ${u.display_name}，你今天有 ${totalPending} 件待處理：`)
    if (pendingLeaves > 0) lines.push(`  ⏰ ${pendingLeaves} 筆請假待審核`)
    if (pendingContracts > 0) lines.push(`  📄 ${pendingContracts} 份合約待審核`)
    lines.push(`👉 前往 myOPS 處理：${appUrl}`)

    // TODO: Send via Teams Bot Framework
    // For now, log the message (Teams Bot integration requires Bot Framework SDK)
    console.log(`[Teams Digest] ${u.email}: ${lines.join('\n')}`)
    sent++
  }

  return NextResponse.json({ data: { sent, total: users.length } })
}
