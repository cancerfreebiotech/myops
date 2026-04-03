import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  const { error } = await service.from('bonus_records').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { deleted: true } })
}
