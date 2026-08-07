import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isValidDateString } from '@/lib/taipei-date'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import type { DrScheduleItem } from '@/lib/daily-report/types'

// 模組關閉時（feature.daily_report off）非 admin 一律擋下，與頁面 canAccessFeature 一致
async function dailyReportEnabled(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  const flags = await getFeatureFlags()
  return canAccessFeature(data?.role ?? '', flags, 'daily_report')
}

// GET /api/daily-report/schedule?date=YYYY-MM-DD&userId=xxx
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await dailyReportEnabled(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const userId = searchParams.get('userId') ?? user.id

  if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 })

  const { data, error } = await supabase
    .from('daily_schedules')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/daily-report/schedule  { date, items }
// 儲存今日行程。items[].done 就是完成回報（feedback 00dbbd55 移除了獨立的
// 「完成回報」分頁與 daily_completions 同步；歷史資料仍留在 daily_completions 表，
// 只是不再讀寫）。
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await dailyReportEnabled(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { date, items } = body

  if (!isValidDateString(date)) {
    return NextResponse.json({ error: 'Invalid date format (YYYY-MM-DD)' }, { status: 400 })
  }

  if (!date || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Missing date or items' }, { status: 400 })
  }

  // 正規化：sid 缺漏時由伺服器補（直接打 API 的情境），done 統一為 boolean
  const scheduleItems: DrScheduleItem[] = items.map((raw: Partial<DrScheduleItem>) => ({
    label: typeof raw?.label === 'string' ? raw.label : '',
    note: typeof raw?.note === 'string' ? raw.note : '',
    sid: typeof raw?.sid === 'string' && raw.sid ? raw.sid : crypto.randomUUID(),
    done: raw?.done === true,
  }))

  const { data, error } = await supabase
    .from('daily_schedules')
    .upsert({ user_id: user.id, date, items: scheduleItems }, { onConflict: 'user_id,date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
