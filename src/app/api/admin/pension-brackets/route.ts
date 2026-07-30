import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// 勞退月提繳工資分級表的整年度替換（Linda 7/30 回報 774a2ea3：沒有地方上傳勞退資料）。
// 與勞健保級距同樣走 SECURITY DEFINER RPC，DELETE + INSERT 在同一交易內完成——
// 分兩趟的話中途失敗會同年度留下新舊兩套級距，之後勞退提繳一律算錯且不會報錯。

interface PensionRow {
  grade: number
  grade_label?: string | null
  wage_floor?: number | null
  wage_ceiling?: number | null
  contribution_wage: number
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
  const { year, rows } = body as { year: number; rows: PensionRow[] }

  if (!year || !Array.isArray(rows)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: t('adminInsurance.emptyRows') }, { status: 400 })
  }
  // 月提繳工資是計算基礎，必須為正數（RPC 內另有同條件檢查）
  for (const row of rows) {
    if (!(Number(row.contribution_wage) > 0)) {
      return NextResponse.json({ error: t('adminPension.rowMissingWage') }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  const { data: insertedCount, error: rpcError } = await admin.rpc('replace_pension_brackets', {
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
