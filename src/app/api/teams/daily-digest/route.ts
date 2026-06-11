import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { sendProactiveMessages } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'

// T55: Teams Bot daily digest — called by cron at 08:30
// Sends a summary of pending items to each user via Teams
export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  // Verify cron or admin (fail closed: cron path requires CRON_SECRET to be configured)
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isCron) {
    // Fallback: check user auth
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
    const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (data?.role !== 'admin') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const service = await createServiceClient()

  // Get all active users with their manager relationships
  const { data: users } = await service
    .from('users')
    .select('id, display_name, email, language, role, granted_features, manager_id')
    .eq('is_active', true)

  if (!users?.length) return NextResponse.json({ data: { sent: 0, failed: 0, total: 0 } })

  // teams-bot lib handles missing TEAMS_BOT_APP_ID/SECRET itself (logs + returns false per message)
  const messages: { userId: string; text: string }[] = []

  for (const u of users) {
    // Get pending items scoped to this user's responsibilities
    // Leave approvals: only count leaves where this user is the manager of the requester
    const leaveQuery = service
      .from('leave_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    // Only managers/HR/admin see pending leaves
    const isAdmin = u.role === 'admin'
    const isHR = (u.granted_features as string[] ?? []).includes('hr_manager')
    if (!isAdmin && !isHR) {
      // Regular managers: only see leaves from their direct reports
      leaveQuery.eq('user_id', '__skip__') // will be filtered below
    }

    // Contracts: only users with approve_contract or admin see pending contracts
    const canApproveContracts = isAdmin || (u.granted_features as string[] ?? []).includes('approve_contract')

    // Unconfirmed announcements for this specific user
    const [leaveRes, contractRes, announcementRes] = await Promise.all([
      // Pending leaves where this user is the approver (manager_id of the requester)
      isAdmin || isHR
        ? service.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        : service.from('leave_requests').select('id, user:users!leave_requests_user_id_fkey(manager_id)', { count: 'exact', head: true }).eq('status', 'pending').eq('user.manager_id', u.id),
      // Pending contracts (only if user can approve)
      canApproveContracts
        ? service.from('documents').select('id', { count: 'exact', head: true }).eq('status', 'pending').in('doc_type', ['NDA', 'MOU', 'CONTRACT', 'AMEND']).is('deleted_at', null)
        : Promise.resolve({ count: 0 }),
      // Unconfirmed announcements that require confirmation for this user
      service
        .from('document_recipients')
        .select('document_id', { count: 'exact', head: true })
        .eq('user_id', u.id)
        .eq('requires_confirmation', true)
        .is('confirmed_at', null),
    ])

    const pendingLeaves = leaveRes.count ?? 0
    const pendingContracts = contractRes.count ?? 0
    const unconfirmedAnnouncements = announcementRes.count ?? 0
    const totalPending = pendingLeaves + pendingContracts + unconfirmedAnnouncements

    if (totalPending === 0) continue

    // Build message in the recipient's language (not the request cookie locale).
    // teamsText uses createTranslator — getTranslations({ locale }) is ignored by
    // src/i18n/request.ts and would fall back to the request cookie locale.
    const lines: string[] = []
    lines.push(teamsText(u.language, 'digestHeader', { name: u.display_name, count: totalPending }))
    if (pendingLeaves > 0) lines.push(teamsText(u.language, 'digestLeaves', { count: pendingLeaves }))
    if (pendingContracts > 0) lines.push(teamsText(u.language, 'digestContracts', { count: pendingContracts }))
    if (unconfirmedAnnouncements > 0) lines.push(teamsText(u.language, 'digestAnnouncements', { count: unconfirmedAnnouncements }))
    lines.push(teamsText(u.language, 'digestFooter'))

    messages.push({ userId: u.id, text: lines.join('\n') })
  }

  // sendProactiveMessages never throws (per-item error isolation in the lib),
  // but guard anyway so notification sending can never 500 the cron run
  let sent = 0
  let failed = 0
  try {
    ;({ sent, failed } = await sendProactiveMessages(messages))
  } catch (e) {
    console.error('[Teams Digest] batch send error:', e)
    failed = messages.length - sent
  }

  return NextResponse.json({ data: { sent, failed, total: messages.length } })
}

// Vercel Cron invokes via GET
export const GET = POST
