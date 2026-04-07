import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Fields HR managers are allowed to update (cannot change role/job_role/granted_features)
const HR_ALLOWED_FIELDS = new Set([
  'department_id', 'employment_type', 'work_region', 'job_title',
  'manager_id', 'deputy_approver_id', 'is_active',
])

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await service.from('users').select('role, job_role').eq('id', user.id).single()
  const isAdmin = currentUser?.role === 'admin'
  const isHR = currentUser?.job_role === 'hr_manager'

  if (!isAdmin && !isHR) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()

  // HR can only update allowed fields
  if (!isAdmin) {
    const restricted = Object.keys(body).filter(k => !HR_ALLOWED_FIELDS.has(k))
    if (restricted.length > 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { error } = await service.from('users').update(body).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: 'ok' })
}
