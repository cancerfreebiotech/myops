import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/layout/PageHeader'
import { GeofencesClient, type Geofence } from './GeofencesClient'

export default async function GeofencesPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: currentUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (currentUser?.role !== 'admin') redirect('/no-permission')

  // admin 通過 geofences_admin_all 的 is_admin() SELECT；系統設定亦通過 is_admin() policy
  const { data: fences } = await service
    .from('geofences')
    .select('id, name, lat, lng, radius_m, is_active')
    .order('created_at')
  const { data: enforceRow } = await service
    .from('system_settings').select('value').eq('key', 'geofence_enforce').maybeSingle()

  const t = await getTranslations('admin.geofences')
  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <GeofencesClient
        initialFences={(fences ?? []) as Geofence[]}
        initialEnforce={enforceRow?.value === 'true'}
      />
    </div>
  )
}
