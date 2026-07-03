import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getTranslations } from 'next-intl/server'

const CATEGORY_LABELS: Record<string, string> = {
  transport: '交通',
  travel: '差旅',
  meal: '誤餐',
  supplies: '用品',
  other: '其他',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待審核',
  approved: '已核准',
  rejected: '已退回',
  paid: '已撥付',
  cancelled: '已取消',
}

// GET /api/export/expenses?month=YYYY-MM — 報帳明細匯出（admin / expense_approve）
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const isApprover = currentUser?.role === 'admin'
    || (currentUser?.granted_features as string[] | null)?.includes('expense_approve')
  if (!isApprover) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  let query = supabase
    .from('expense_claims')
    .select(`
      *,
      user:users!expense_claims_user_id_fkey(display_name, email),
      reviewer:users!expense_claims_reviewed_by_fkey(display_name)
    `)
    .order('expense_date', { ascending: true })

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    const start = `${month}-01`
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    query = query.gte('expense_date', start).lt('expense_date', end)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type ClaimRow = Record<string, unknown> & {
    expense_date: string
    category: string
    amount: number
    currency: string
    description: string
    status: string
    reviewed_at: string | null
    paid_at: string | null
    user: { display_name: string | null; email: string } | null
    reviewer: { display_name: string | null } | null
  }

  const rows = ((data ?? []) as unknown as ClaimRow[]).map(c => ({
    '費用日期': c.expense_date,
    '員工': c.user?.display_name ?? c.user?.email ?? '',
    '類別': CATEGORY_LABELS[c.category] ?? c.category,
    '金額': c.amount,
    '幣別': c.currency,
    '事由': c.description,
    '狀態': STATUS_LABELS[c.status] ?? c.status,
    '審核人': c.reviewer?.display_name ?? '',
    '審核時間': c.reviewed_at ? c.reviewed_at.slice(0, 10) : '',
    '撥付日期': c.paid_at ? c.paid_at.slice(0, 10) : '',
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, '報帳明細')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="expenses_${month ?? 'all'}.xlsx"`,
    },
  })
}
