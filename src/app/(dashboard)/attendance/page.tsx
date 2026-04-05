import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { AttendanceClient } from './AttendanceClient'

export default async function AttendancePage() {
  const t = await getTranslations('attendance')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, employment_type, display_name, department_id')
    .eq('id', user.id)
    .single()

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .is('deleted_at', null)
    .order('code')

  const isHR = currentUser?.role === 'admin' || currentUser?.role === 'hr'

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <AttendanceClient
        currentUser={currentUser}
        departments={departments ?? []}
        isHR={isHR}
      />
    </div>
  )
}
