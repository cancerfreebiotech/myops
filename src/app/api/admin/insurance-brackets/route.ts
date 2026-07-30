import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

interface LaborRow {
  grade: number
  /** 「部分工時」等非數字級別的原始文字；此時 grade 為 0 */
  grade_label?: string | null
  insured_salary: number
  employee_share: number
  employer_share: number
}

interface HealthRow {
  grade: number
  grade_label?: string | null
  insured_salary: number
  employee_share: number
  employee_dependents: number
  employer_share: number
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()

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

  // 必要條件是「投保薪資為正」；等級可以是 0，但必須帶 grade_label
  //（官方表第 1 級之前的「部分工時」數級等級欄是文字，見 migration 20260730000001）。
  // RPC 內有同條件的防禦性檢查。
  for (const row of rows) {
    const hasLabel = typeof row.grade_label === 'string' && row.grade_label.trim() !== ''
    if (!row.insured_salary || (!row.grade && !hasLabel)) {
      return NextResponse.json({ error: t('adminInsurance.rowMissingGradeOrSalary') }, { status: 400 })
    }
  }

  // 整年度替換走單一 RPC：DELETE 舊年度 + INSERT 新級距在同一交易內完成，
  // 取代原本的 insert-then-delete（兩趟 PostgREST 呼叫、無交易保護，
  // delete 那趟失敗就會同年度留下新舊兩套級距，之後保費一律算錯）。
  // 該 RPC 只 GRANT service_role，故必須用真 service-role client 呼叫；
  // 授權已在上方以 admin / finance_payroll 把關（RPC 內另有同條件的防禦性檢查）。
  const admin = createAdminClient()
  const { data: insertedCount, error: rpcError } = await admin.rpc('replace_insurance_brackets', {
    p_kind: type,
    p_year: year,
    p_rows: rows,
    p_uploaded_by: user.id,
  })

  if (rpcError) {
    if (rpcError.message?.includes('forbidden')) {
      return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
    }
    return NextResponse.json({ error: t('adminInsurance.uploadFailed', { message: rpcError.message }) }, { status: 500 })
  }

  return NextResponse.json({ data: { inserted: Number(insertedCount ?? rows.length) } })
}
