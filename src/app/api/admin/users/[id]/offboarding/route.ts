import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// T61: Offboarding checklist API — returns active items for a user about to be deactivated
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (currentUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get target user info
  const { data: targetUser } = await service
    .from('users')
    .select('id, display_name, email')
    .eq('id', userId)
    .single()

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // 1. Active contracts they own
  const { data: contracts } = await service
    .from('documents')
    .select('id, title, status, doc_type')
    .eq('owner_id', userId)
    .in('status', ['pending', 'approved'])
    .in('doc_type', ['NDA', 'MOU', 'CONTRACT', 'AMEND'])
    .is('deleted_at', null)

  // 2. Active projects they lead
  const { data: projects } = await service
    .from('projects')
    .select('id, name, status')
    .eq('project_lead_id', userId)
    .eq('status', 'active')
    .is('deleted_at', null)

  // 3. Pending leave requests (their own)
  const { data: pendingLeaves } = await service
    .from('leave_requests')
    .select('id, start_date, end_date, status')
    .eq('user_id', userId)
    .eq('status', 'pending')

  // 4. Pending overtime requests
  const { data: pendingOT } = await service
    .from('overtime_requests')
    .select('id, ot_date, hours, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'lead_approved'])

  // 5. Payroll records not yet paid
  const { data: unpaidPayroll } = await service
    .from('payroll_records')
    .select('id, year, month, net_pay, status')
    .eq('user_id', userId)
    .neq('status', 'paid')

  return NextResponse.json({
    data: {
      user: targetUser,
      contracts: contracts ?? [],
      projects: projects ?? [],
      pendingLeaves: pendingLeaves ?? [],
      pendingOT: pendingOT ?? [],
      unpaidPayroll: unpaidPayroll ?? [],
    },
  })
}
