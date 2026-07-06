import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { notifyCooOverThreshold } from '@/lib/overtime-coo-notify'

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const body = await request.json()
  const { ot_date, start_time, end_time, reason, ot_type, project_id } = body

  if (!ot_date || !start_time || !end_time || !reason || !ot_type) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  // Calculate hours
  const startMinutes = parseInt(start_time.split(':')[0]) * 60 + parseInt(start_time.split(':')[1])
  const endMinutes = parseInt(end_time.split(':')[0]) * 60 + parseInt(end_time.split(':')[1])
  const total_hours = Math.max(0, (endMinutes - startMinutes) / 60)

  // DB 欄位為 hours / request_type（無 total_hours / ot_type / approver_id）
  const requestType = ot_type === 'project' ? 'project' : 'regular'
  const { data, error } = await service.from('overtime_requests').insert({
    user_id: user.id,
    ot_date,
    start_time,
    end_time,
    hours: total_hours,
    reason,
    request_type: requestType,
    project_id: project_id ?? null,
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // B7：專案加班時數超過 COO 門檻 → 通知營運長（唯讀提醒，永不阻斷送出回應）
  if (requestType === 'project') {
    try {
      await notifyCooOverThreshold(service, {
        applicantId: user.id,
        projectId: project_id ?? null,
        hours: total_hours,
        otDate: ot_date,
      })
    } catch (e) {
      console.error('[overtime] COO over-threshold notify failed:', e)
    }
  }

  return NextResponse.json({ data })
}

export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') ?? 'mine'

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'hr'

  // ot_type/total_hours 為 client 使用的欄位名；DB 實為 request_type/hours，用別名回傳
  let query = service
    .from('overtime_requests')
    .select(`*, ot_type:request_type, total_hours:hours, user:users!overtime_requests_user_id_fkey(id, display_name), project:projects(id, name)`)
    .order('created_at', { ascending: false })

  if (view === 'mine') {
    query = query.eq('user_id', user.id)
  } else if (view === 'approve') {
    // 無 approver_id 欄位：核准對象由 RLS（主管/專案負責人/coo/admin 可見）限定，
    // 僅列 pending 且排除自己的單
    query = query.eq('status', 'pending')
    if (!isAdmin) query = query.neq('user_id', user.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
