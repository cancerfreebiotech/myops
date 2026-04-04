import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (currentUser?.role !== 'admin') redirect('/')

  const { data: settings } = await service
    .from('system_settings')
    .select('key, value')
    .order('key')

  return (
    <div>
      <PageHeader title="系統設定" description="全域參數與 API 金鑰管理" />
      <SettingsClient settings={settings ?? []} />
    </div>
  )
}
