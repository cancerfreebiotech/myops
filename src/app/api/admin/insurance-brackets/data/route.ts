import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  if (currentUser?.role !== 'admin' && !currentUser?.granted_features?.includes('finance_payroll')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [laborRes, healthRes] = await Promise.all([
    service.from('labor_insurance_brackets').select('*').order('effective_year', { ascending: false }).order('grade'),
    service.from('health_insurance_brackets').select('*').order('effective_year', { ascending: false }).order('grade'),
  ])

  return NextResponse.json({
    data: {
      labor: laborRes.data ?? [],
      health: healthRes.data ?? [],
    },
  })
}
