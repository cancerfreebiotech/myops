import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import type { UserOption } from '../shared'
import { RfqDetailClient } from './RfqDetailClient'
import type { VendorOption } from './RfqItemsSection'

// 詢價單詳情 — server gate only; the client loads the document + approval
// steps from /api/procurement/rfqs/[id] (which also computes locked fields
// for the signed-in user).

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, job_role, granted_features')
    .eq('id', user.id)
    .single()
  if (!currentUser) redirect('/login')

  const role = currentUser.role ?? ''
  const jobRole = currentUser.job_role ?? ''
  const granted = (currentUser.granted_features as string[] | null) ?? []

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(role, featureFlags, 'procurement')) redirect('/no-permission')

  const canRead =
    userHasFeature(role, jobRole, granted, 'procurement_unit') ||
    userHasFeature(role, jobRole, granted, 'procurement_manage')
  if (!canRead) redirect('/no-permission')

  const { data: users } = await service
    .from('users')
    .select('id, display_name')
    .eq('is_active', true)
    .order('display_name', { ascending: true })

  // 廠商主檔（登錄廠商清冊）— 供品項的「建議廠商」與報價的「廠商」下拉選用
  const { data: vendors } = await service
    .from('vendors')
    .select('id, vendor_code, name')
    .is('deleted_at', null)
    .order('name', { ascending: true })

  return (
    <RfqDetailClient
      rfqId={id}
      users={(users as UserOption[]) ?? []}
      vendors={(vendors as VendorOption[]) ?? []}
    />
  )
}
