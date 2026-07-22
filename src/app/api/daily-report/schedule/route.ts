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
// 儲存今日行程，並將行程項目同步到 daily_completions（完成回報）：
// - 行程項目以 sid 對應完成回報中的衍生項目（label/done 以行程為準，note 保留完成回報側的補充）
// - 舊資料（完成回報項目無 sid）以 label 認領一次，認領後改由 sid 對應
// - 行程刪除的項目會移除其衍生的完成回報項目；手動新增（無 sid）的完成回報項目一律保留
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

  const { data: existingCompletion, error: compReadError } = await supabase
    .from('daily_completions')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()
  if (compReadError) return NextResponse.json({ error: compReadError.message }, { status: 500 })

  const existingItems: DrCompletionItem[] = Array.isArray(existingCompletion?.items)
    ? existingCompletion.items
    : []

  const claimed = new Set<number>()
  const derived: DrCompletionItem[] = scheduleItems.map((s, idx) => {
    // 先以 sid 對應；找不到再以 label 認領一個尚無 sid 的舊項目（一次性遷移）
    let matchIdx = existingItems.findIndex((c, i) => !claimed.has(i) && !!c.sid && c.sid === s.sid)
    const adoptedLegacy = matchIdx < 0
    if (matchIdx < 0) {
      matchIdx = existingItems.findIndex(
        (c, i) => !claimed.has(i) && !c.sid && typeof c.label === 'string' && c.label.trim() !== '' && c.label === s.label
      )
    }
    if (matchIdx >= 0) {
      claimed.add(matchIdx)
      const c = existingItems[matchIdx]
      // 舊項目認領時尊重其既有完成狀態（避免重存舊行程把歷史紀錄改回未完成）；之後以行程勾選為準
      const done = adoptedLegacy ? (s.done === true || c.done === true) : s.done === true
      scheduleItems[idx] = { ...s, done }
      return { sid: s.sid, label: s.label, note: typeof c.note === 'string' ? c.note : '', done }
    }
    return { sid: s.sid, label: s.label, note: '', done: s.done === true }
  })

  // 未被認領的手動項目（無 sid）保留；被行程刪除的衍生項目（有 sid 但已無對應）移除
  const manual = existingItems.filter((c, i) => !claimed.has(i) && !c.sid)
  const mergedCompletionItems = [...derived, ...manual]

  const { data, error } = await supabase
    .from('daily_schedules')
    .upsert({ user_id: user.id, date, items: scheduleItems }, { onConflict: 'user_id,date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 完成回報無既有列且合併後也沒有任何項目時，不建立空列
  let completion = existingCompletion ?? null
  if (existingCompletion || mergedCompletionItems.length > 0) {
    const { data: compData, error: compError } = await supabase
      .from('daily_completions')
      .upsert({ user_id: user.id, date, items: mergedCompletionItems }, { onConflict: 'user_id,date' })
      .select()
      .single()
    if (compError) return NextResponse.json({ error: compError.message }, { status: 500 })
    completion = compData
  }

  return NextResponse.json({ data, completion })
}
