import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function requireHR(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'hr'].includes(data?.role ?? '')) return null
  return user
}

// 前端表單欄位 → leave_types 實際欄位對齊：
// name → name_zh/name_en/name_ja(NOT NULL)、applies_to → applicable_to、
// pay_rate(full/half/none) → salary_ratio(numeric)、max_days_per_year → default_quota_days、
// advance_days_required → advance_days。
export function mapLeaveTypeBody(body: Record<string, unknown>): Record<string, unknown> {
  const ratioMap: Record<string, number> = { full: 1.0, half: 0.5, none: 0.0 }
  const row: Record<string, unknown> = {}
  if (body.name != null) { row.name_zh = body.name; row.name_en = body.name; row.name_ja = body.name }
  if (body.applies_to != null) row.applicable_to = body.applies_to
  if (body.pay_rate != null) {
    const key = String(body.pay_rate)
    const n = Number(body.pay_rate)
    row.salary_ratio = key in ratioMap ? ratioMap[key] : (Number.isFinite(n) ? n : 1.0)
  }
  if (body.max_days_per_year !== undefined) row.default_quota_days = body.max_days_per_year
  if (body.advance_days_required != null) row.advance_days = body.advance_days_required
  if (body.is_active != null) row.is_active = body.is_active
  return row
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const user = await requireHR(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { data, error } = await service.from('leave_types').insert(mapLeaveTypeBody(body)).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
