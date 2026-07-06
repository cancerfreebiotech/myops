import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

// GET /api/assets/gr-options — 已核准的進貨驗收單清單（供轉資產選用；限 admin/asset_manage）
// 授權由 approved_grs_for_asset() SECURITY DEFINER function 把關
export async function GET() {
  const supabase = await createClient()
  const t = await getTranslations('apiErrors')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data, error } = await supabase.rpc('approved_grs_for_asset')
  if (error) {
    const status = error.message.includes('forbidden') ? 403 : 500
    return NextResponse.json({ error: status === 403 ? t('common.forbidden') : error.message }, { status })
  }
  return NextResponse.json({ data: data ?? [] })
}
