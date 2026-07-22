import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// 授權比照出勤管理頁 (admin/attendance/page.tsx) 的 gate：
//   role === 'admin' || job_role === 'hr_manager' || granted_features 含 'hr_manager'
// 注意：attendance_records 的 UPDATE RLS 政策僅涵蓋 is_admin() 或 has_feature('hr_manager')，
// 不含 job_role === 'hr_manager'。若走 createServiceClient()（RLS 生效），job_role-only 的
// hr_manager 會通過本 route gate 卻被 RLS 靜默擋下（0 rows）→ 誤判 404。
// 故此處以 createAdminClient()（繞 RLS）＋ route 內授權檢查，確保與頁面 gate 完全一致。
async function requireAttendanceAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null as null, allowed: false }
  const { data } = await supabase
    .from('users')
    .select('role, job_role, granted_features')
    .eq('id', user.id)
    .single()
  const grantedFeatures = (data?.granted_features as string[] | null) ?? []
  const allowed =
    data?.role === 'admin' ||
    data?.job_role === 'hr_manager' ||
    grantedFeatures.includes('hr_manager')
  return { user, allowed }
}

// POST /api/admin/attendance/[id]/void  { reason }（必填）→ 作廢
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()

  const { user, allowed } = await requireAttendanceAdmin(supabase)
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!allowed) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('attendance_records')
    .update({
      voided_at: new Date().toISOString(),
      voided_by: user.id,
      void_reason: reason,
    })
    .eq('id', id)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  }
  return NextResponse.json({ data: { id, voided: true } })
}

// DELETE /api/admin/attendance/[id]/void → 取消作廢（清空三欄）
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()

  const { user, allowed } = await requireAttendanceAdmin(supabase)
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (!allowed) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('attendance_records')
    .update({
      voided_at: null,
      voided_by: null,
      void_reason: null,
    })
    .eq('id', id)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  }
  return NextResponse.json({ data: { id, voided: false } })
}
