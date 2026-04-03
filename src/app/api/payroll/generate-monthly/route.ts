import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// T49: Monthly payroll auto-generation endpoint
// Can be called by pg_cron or Supabase Edge Function on the 1st of each month
// Also callable manually by admin/HR from the admin payroll page
export async function POST(request: NextRequest) {
  const service = await createServiceClient()

  // Verify caller is either admin or has a valid cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Called by cron — proceed
  } else {
    // Called by user — check permissions
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await supabase
      .from('users')
      .select('role, granted_features')
      .eq('id', user.id)
      .single()

    const isAdmin = currentUser?.role === 'admin'
    const isHR = currentUser?.granted_features?.includes('hr_manager')
    if (!isAdmin && !isHR) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // Forward to the calculate endpoint logic
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ops.cancerfree.io'
  const calcRes = await fetch(`${baseUrl}/api/payroll/calculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cronSecret ? { 'Authorization': `Bearer ${cronSecret}` } : {}),
      'Cookie': request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({ year, month }),
  })

  const result = await calcRes.json()

  if (!calcRes.ok) {
    return NextResponse.json({ error: result.error ?? 'Generation failed' }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      ...result.data,
      year,
      month,
      message: `${year}/${month} 薪資草稿已自動產出`,
    },
  })
}
