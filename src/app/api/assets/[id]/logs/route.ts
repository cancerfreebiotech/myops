import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { isValidDateString } from '@/lib/taipei-date'

const LOG_TYPES = ['maintenance', 'calibration', 'repair', 'checkout', 'checkin', 'note']

// POST /api/assets/[id]/logs — 新增記錄（admin / asset_manage）
// 保養/校驗記錄若帶 next_due_date，同步更新資產的下次到期日；
// checkout/checkin 若帶 custodian_id，同步更新保管人
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: me } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()
  const manage = me?.role === 'admin' || (me?.granted_features as string[] | null)?.includes('asset_manage')
  if (!manage) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const body = await request.json()
  const { log_type, log_date, performed_by, next_due_date, note, attachment_paths, custodian_id } = body

  if (!LOG_TYPES.includes(log_type) || !isValidDateString(log_date)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  if (next_due_date && !isValidDateString(next_due_date)) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  const { data: asset } = await supabase
    .from('assets')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!asset) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const { data: log, error } = await supabase
    .from('asset_logs')
    .insert({
      asset_id: id,
      log_type,
      log_date,
      performed_by: performed_by || null,
      user_id: user.id,
      // checkout/checkin 保存當下借用人 id，供歷史記錄追溯（其他類型不適用）
      custodian_id: (log_type === 'checkout' || log_type === 'checkin') ? (custodian_id || null) : null,
      next_due_date: next_due_date || null,
      note: note || null,
      attachment_paths: Array.isArray(attachment_paths) ? attachment_paths : [],
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 同步資產欄位
  const assetUpdates: Record<string, unknown> = {}
  if (log_type === 'calibration' && next_due_date) assetUpdates.next_calibration_date = next_due_date
  if (log_type === 'maintenance' && next_due_date) assetUpdates.next_maintenance_date = next_due_date
  if ((log_type === 'checkout' || log_type === 'checkin') && custodian_id !== undefined) {
    assetUpdates.custodian_id = custodian_id || null
  }
  if (Object.keys(assetUpdates).length) {
    await supabase.from('assets').update(assetUpdates).eq('id', id)
  }

  return NextResponse.json({ data: log })
}
