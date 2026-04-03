import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// T50: Payroll anomaly detection API
// Scans payroll records for anomalies and flags them
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.granted_features?.includes('hr_manager')
  const isFinance = currentUser?.granted_features?.includes('finance_payroll')
  if (!isAdmin && !isHR && !isFinance) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const year = body.year ?? new Date().getFullYear()
  const month = body.month ?? new Date().getMonth() + 1

  // Get current month records
  const { data: records } = await service
    .from('payroll_records')
    .select('*, user:users!payroll_records_user_id_fkey(id, display_name, employment_type)')
    .eq('year', year)
    .eq('month', month)

  if (!records?.length) {
    return NextResponse.json({ data: { anomalies: [], scanned: 0 } })
  }

  // Get previous month records for comparison
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const { data: prevRecords } = await service
    .from('payroll_records')
    .select('user_id, net_pay')
    .eq('year', prevYear)
    .eq('month', prevMonth)

  const prevMap = new Map(prevRecords?.map(r => [r.user_id, Number(r.net_pay)]) ?? [])

  // Get overtime hours for the month
  const userIds = records.map(r => r.user_id)
  const { data: overtimeRecords } = await service
    .from('overtime_requests')
    .select('user_id, hours')
    .in('user_id', userIds)
    .in('status', ['approved', 'coo_approved', 'lead_approved'])
    .gte('ot_date', `${year}-${String(month).padStart(2, '0')}-01`)
    .lte('ot_date', `${year}-${String(month).padStart(2, '0')}-31`)

  // Sum OT hours per user
  const otHoursMap = new Map<string, number>()
  for (const ot of overtimeRecords ?? []) {
    otHoursMap.set(ot.user_id, (otHoursMap.get(ot.user_id) ?? 0) + Number(ot.hours))
  }

  // Check for new hires and resignations
  const { data: profiles } = await service
    .from('user_profiles')
    .select('user_id, hire_date, termination_date')
    .in('user_id', userIds)

  const profileMap = new Map(profiles?.map(p => [p.user_id, p]) ?? [])

  // Detect anomalies
  const anomalies: any[] = []
  let flagged = 0

  for (const rec of records) {
    const flags: string[] = []
    const u = Array.isArray(rec.user) ? rec.user[0] : rec.user

    // 1. OT exceeds 46 hours (labor law limit)
    const otHours = otHoursMap.get(rec.user_id) ?? 0
    if (otHours > 46) {
      flags.push(`加班時數 ${otHours} 小時超過勞基法上限 46 小時`)
    }

    // 2. Net pay differs from prev month by >20%
    const prevPay = prevMap.get(rec.user_id)
    if (prevPay && prevPay > 0) {
      const diff = Math.abs(Number(rec.net_pay) - prevPay) / prevPay
      if (diff > 0.2) {
        flags.push(`實發金額與上月差異 ${(diff * 100).toFixed(0)}%`)
      }
    }

    // 3. Unpaid leave anomaly
    if (Number(rec.unpaid_leave_deduct) > Number(rec.base_salary) * 0.5) {
      flags.push('無薪假扣款超過底薪 50%')
    }

    // 4. New hire / resignation — may need pro-rata
    const profile = profileMap.get(rec.user_id)
    if (profile?.hire_date) {
      const hireDate = new Date(profile.hire_date)
      if (hireDate.getFullYear() === year && hireDate.getMonth() + 1 === month) {
        flags.push('本月新進員工，需確認按比例計算')
      }
    }
    if (profile?.termination_date) {
      const termDate = new Date(profile.termination_date)
      if (termDate.getFullYear() === year && termDate.getMonth() + 1 === month) {
        flags.push('本月離職員工，需確認按比例計算')
      }
    }

    // 5. Zero base salary for full_time
    if (u?.employment_type === 'full_time' && Number(rec.base_salary) === 0) {
      flags.push('正職員工底薪為 0')
    }

    if (flags.length > 0) {
      // Update anomaly_flags in DB
      await service
        .from('payroll_records')
        .update({ anomaly_flags: flags })
        .eq('id', rec.id)

      anomalies.push({
        id: rec.id,
        user_id: rec.user_id,
        display_name: u?.display_name ?? '—',
        net_pay: rec.net_pay,
        flags,
      })
      flagged++
    }
  }

  return NextResponse.json({
    data: { anomalies, scanned: records.length, flagged },
  })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.granted_features?.includes('hr_manager')
  const isFinance = currentUser?.granted_features?.includes('finance_payroll')
  if (!isAdmin && !isHR && !isFinance) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  const { data, error } = await service
    .from('payroll_records')
    .select('*, user:users!payroll_records_user_id_fkey(id, display_name, department:departments(name))')
    .eq('year', year)
    .eq('month', month)
    .not('anomaly_flags', 'is', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
