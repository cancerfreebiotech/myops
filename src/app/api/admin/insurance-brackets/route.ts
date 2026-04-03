import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface LaborRow {
  grade: number
  insured_salary: number
  employee_share: number
  employer_share: number
}

interface HealthRow {
  grade: number
  insured_salary: number
  employee_share: number
  employee_dependents: number
  employer_share: number
}

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
  const hasFinancePayroll = currentUser?.granted_features?.includes('finance_payroll')
  if (!isAdmin && !hasFinancePayroll) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { type, year, rows } = body as {
    type: 'labor' | 'health'
    year: number
    rows: (LaborRow | HealthRow)[]
  }

  if (!type || !year || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'Missing required fields: type, year, rows' }, { status: 400 })
  }
  if (type !== 'labor' && type !== 'health') {
    return NextResponse.json({ error: 'type must be "labor" or "health"' }, { status: 400 })
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: 'rows cannot be empty' }, { status: 400 })
  }

  const table = type === 'labor' ? 'labor_insurance_brackets' : 'health_insurance_brackets'

  // Delete existing rows for this year
  const { error: deleteError } = await service
    .from(table)
    .delete()
    .eq('effective_year', year)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // Build insert payload
  const insertRows = rows.map(row => ({
    ...row,
    effective_year: year,
    uploaded_by: user.id,
  }))

  const { error: insertError } = await service.from(table).insert(insertRows)

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { inserted: insertRows.length } })
}
