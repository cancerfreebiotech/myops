import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { computeAnnualLeave } from '@/lib/leave-seniority'

// 依年資自動帶入特休 (週年制) — POST /api/admin/leave-balances/auto-fill
//
// For every active full-time employee with a hire date, compute the 特休
// entitlement for the anniversary period containing today and upsert a
// leave_balances row (source='auto'). Manual HR overrides (source='manual') are
// NEVER clobbered, and used_days is preserved on an existing auto row.
// Authorization: admin or HR (job_role='hr_manager' or granted_features hr_manager),
// same as the balance editor; writes go through the admin client (RLS bypass, as
// the balance save/deduct paths do — authorization is enforced here).

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, job_role, granted_features')
    .eq('id', user.id)
    .single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.job_role === 'hr_manager' || (currentUser?.granted_features ?? []).includes('hr_manager')
  if (!isAdmin && !isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // The 特休 leave type is the by_seniority one (default_quota_days is NULL for it)
  const { data: leaveType } = await admin
    .from('leave_types')
    .select('id')
    .eq('quota_type', 'by_seniority')
    .eq('is_active', true)
    .maybeSingle()
  if (!leaveType) {
    return NextResponse.json({ error: 'No by_seniority (特休) leave type found' }, { status: 400 })
  }
  const leaveTypeId = leaveType.id

  // active full-time employees
  const { data: usersData } = await admin
    .from('users')
    .select('id')
    .eq('is_active', true)
    .eq('employment_type', 'full_time')
  const roster = (usersData ?? []) as { id: string }[]

  // hire_date lives on user_profiles, which has TWO FKs to users (user_id, updated_by),
  // so a PostgREST embed would be ambiguous — join in TS by user_id instead.
  const hireByUser = new Map<string, string | null>()
  if (roster.length > 0) {
    const { data: profs } = await admin
      .from('user_profiles')
      .select('user_id, hire_date')
      .in('user_id', roster.map(u => u.id))
    for (const p of (profs ?? []) as { user_id: string; hire_date: string | null }[]) {
      hireByUser.set(p.user_id, p.hire_date ?? null)
    }
  }

  const today = new Date()
  let generated = 0
  let skippedManual = 0
  const missingHireDate: string[] = []

  for (const u of roster) {
    const hireDate = hireByUser.get(u.id) ?? null
    if (!hireDate) { missingHireDate.push(u.id); continue }

    const ent = computeAnnualLeave(hireDate, today)
    if (!ent) { missingHireDate.push(u.id); continue }

    const year = Number(ent.periodStart.slice(0, 4))

    // preserve any manual override for this (user, 特休, period-year)
    const { data: existing } = await admin
      .from('leave_balances')
      .select('id, source, used_days')
      .eq('user_id', u.id)
      .eq('leave_type_id', leaveTypeId)
      .eq('year', year)
      .maybeSingle()
    if (existing && existing.source === 'manual') { skippedManual++; continue }

    const { error } = await admin.from('leave_balances').upsert({
      user_id: u.id,
      leave_type_id: leaveTypeId,
      year,
      total_days: ent.days,
      used_days: existing?.used_days ?? 0,
      period_start: ent.periodStart,
      period_end: ent.periodEnd,
      source: 'auto',
      updated_by: user.id,
    }, { onConflict: 'user_id,leave_type_id,year' })
    if (error) {
      console.error('[leave auto-fill] upsert failed for', u.id, error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    generated++
  }

  return NextResponse.json({
    data: { generated, skippedManual, missingHireDate: missingHireDate.length },
  })
}
