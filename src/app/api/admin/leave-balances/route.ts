import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 授權：admin 或 HR。舊版用 ['admin','hr'].includes(role) 是死碼——users.role 只有
  // 'member'/'admin'，HR 是以 job_role='hr_manager'（或 granted_features 內含 hr_manager）辨識，
  // 與此頁面的檢視權限一致，否則會出現「看得到頁面卻存不了」的 403。
  const { data: currentUser } = await supabase
    .from('users')
    .select('role, job_role, granted_features')
    .eq('id', user.id)
    .single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.job_role === 'hr_manager' || (currentUser?.granted_features ?? []).includes('hr_manager')
  if (!isAdmin && !isHR) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { user_id, leave_type_id, year, allocated_days } = await request.json()

  // 授權已在上方完成 → 用 admin client 讀寫，繞過 leave_balances 的 RLS
  // （其寫入政策為 has_feature('hr_manager') OR is_admin()，而 has_feature 只看
  // granted_features 不看 job_role，會誤擋以 job_role 認定的 HR；讀取政策也會讓
  // 非 admin 的 HR 只讀得到自己那筆而抓不到他人的 used_days）。
  const admin = createAdminClient()

  const existing = await admin
    .from('leave_balances')
    .select('id, used_days')
    .eq('user_id', user_id)
    .eq('leave_type_id', leave_type_id)
    .eq('year', year)
    .single()

  const used = existing.data?.used_days ?? 0

  // leave_balances 實際欄位：total_days(NOT NULL)/used_days；無 allocated_days/remaining_days
  // （餘額 = total_days - used_days，於讀取端換算）。前端傳入的配額寫入 total_days。
  const { error } = await admin.from('leave_balances').upsert({
    user_id, leave_type_id, year,
    total_days: allocated_days,
    used_days: used,
  }, { onConflict: 'user_id,leave_type_id,year' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { ok: true } })
}
