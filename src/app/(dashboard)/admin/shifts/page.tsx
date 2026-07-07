import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { ShiftsManager } from './ShiftsManager'

export default async function ShiftsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('users').select('role, job_role').eq('id', user.id).single()
  const isAdmin = me?.role === 'admin'
  const isHR = me?.job_role === 'hr_manager'
  if (!isAdmin && !isHR) redirect('/no-permission')

  const { data: shifts } = await service
    .from('work_shifts')
    .select('id, name, start_time, end_time, work_days, flex_minutes, break_minutes, is_active')
    .is('deleted_at', null)
    .order('start_time')

  const { data: users } = await service
    .from('users')
    .select('id, display_name, employment_type')
    .eq('is_active', true)
    .order('display_name')

  // 每位員工目前(今日)適用的最新指派
  const { data: assigns } = await service
    .from('user_shifts')
    .select('user_id, shift_id, effective_from')
    .lte('effective_from', new Date().toISOString().slice(0, 10))
    .order('effective_from', { ascending: false })

  const currentByUser: Record<string, string> = {}
  for (const a of assigns ?? []) if (!(a.user_id in currentByUser)) currentByUser[a.user_id] = a.shift_id

  const t = await getTranslations('nav')
  const tAdmin = await getTranslations('admin.shifts')

  return (
    <div>
      <PageHeader title={t('adminShifts')} description={tAdmin('description')} />
      <ShiftsManager
        shifts={shifts ?? []}
        users={users ?? []}
        currentByUser={currentByUser}
      />
    </div>
  )
}
