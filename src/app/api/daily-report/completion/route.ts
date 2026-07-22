import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isValidDateString } from '@/lib/taipei-date'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import type { DrCompletionItem, DrScheduleItem } from '@/lib/daily-report/types'

// 模組關閉時（feature.daily_report off）非 admin 一律擋下，與頁面 canAccessFeature 一致
async function dailyReportEnabled(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  const flags = await getFeatureFlags()
  return canAccessFeature(data?.role ?? '', flags, 'daily_report')
}

// GET /api/daily-report/completion?date=YYYY-MM-DD&userId=xxx
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
    .from('daily_completions')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/daily-report/completion  { date, items }
// 儲存完成回報，並把「衍生自今日行程」項目（有 sid）的完成狀態回寫到 daily_schedules，
// 讓兩個分頁的勾選狀態保持一致（今日行程分頁勾選同步過來，這裡取消也能還原）。
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

  const { data, error } = await supabase
    .from('daily_completions')
    .upsert({ user_id: user.id, date, items }, { onConflict: 'user_id,date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 回寫：依 sid 將 done 同步回今日行程（只動 done，label/note 以行程分頁為準）
  const completionItems = items as DrCompletionItem[]
  const { data: schedule } = await supabase
    .from('daily_schedules')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  if (schedule && Array.isArray(schedule.items)) {
    let changed = false
    const syncedItems = (schedule.items as DrScheduleItem[]).map(s => {
      if (!s.sid) return s
      const c = completionItems.find(ci => ci?.sid === s.sid)
      if (!c || (c.done === true) === (s.done === true)) return s
      changed = true
      return { ...s, done: c.done === true }
    })
    if (changed) {
      const { error: schError } = await supabase
        .from('daily_schedules')
        .update({ items: syncedItems })
        .eq('id', schedule.id)
      if (schError) return NextResponse.json({ error: schError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ data })
}
