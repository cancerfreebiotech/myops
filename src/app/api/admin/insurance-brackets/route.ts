import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

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
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const hasFinancePayroll = currentUser?.granted_features?.includes('finance_payroll')
  if (!isAdmin && !hasFinancePayroll) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const body = await request.json()
  const { type, year, rows } = body as {
    type: 'labor' | 'health'
    year: number
    rows: (LaborRow | HealthRow)[]
  }

  if (!type || !year || !Array.isArray(rows)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  if (type !== 'labor' && type !== 'health') {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: t('adminInsurance.emptyRows') }, { status: 400 })
  }

  const table = type === 'labor' ? 'labor_insurance_brackets' : 'health_insurance_brackets'

  // Build insert payload first — validate before deleting
  const insertRows = rows.map(row => ({
    ...row,
    effective_year: year,
    uploaded_by: user.id,
  }))

  // Validate all rows have required fields
  for (const row of insertRows) {
    if (!row.grade || !row.insured_salary) {
      return NextResponse.json({ error: t('adminInsurance.rowMissingGradeOrSalary') }, { status: 400 })
    }
  }

  // Use a transaction-like approach: try insert first, then delete old
  // Step 1: Insert new rows (they'll coexist temporarily with old ones)
  const { data: inserted, error: insertError } = await service
    .from(table)
    .insert(insertRows)
    .select('id')

  if (insertError) {
    return NextResponse.json({ error: t('adminInsurance.uploadFailed', { message: insertError.message }) }, { status: 500 })
  }

  // Step 2: Delete old rows for this year (exclude the ones we just inserted)
  const newIds = (inserted ?? []).map((r: any) => r.id)
  if (newIds.length > 0) {
    await service
      .from(table)
      .delete()
      .eq('effective_year', year)
      .not('id', 'in', `(${newIds.join(',')})`)
  }

  return NextResponse.json({ data: { inserted: insertRows.length } })
}
