import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getFeatureFlags, canAccessFeature } from '@/lib/feature-flags'
import { userHasFeature } from '@/lib/job-role-features'
import {
  PurchaseRequestDetailClient,
  type ProductOption,
  type UserOption,
  type VendorOption,
} from './PurchaseRequestDetailClient'

// 請採購單 detail — header form (46 cols, sectioned) + pr_items editor +
// approval timeline / actions + convert (轉進貨單 / 訂金請款) + void-and-clone.
// Auth + feature gate on the server; the document itself is loaded client-side
// via /api/procurement/purchase-requests/[id] so it refreshes after each action.

export default async function PurchaseRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const featureFlags = await getFeatureFlags()
  if (!canAccessFeature(currentUser.role, featureFlags, 'procurement')) redirect('/')

  const granted = (currentUser.granted_features as string[] | null) ?? []
  const hasAccess =
    userHasFeature(currentUser.role, currentUser.job_role, granted, 'procurement_unit') ||
    userHasFeature(currentUser.role, currentUser.job_role, granted, 'procurement_manage')
  if (!hasAccess) redirect('/')

  const [{ data: doc }, { data: users }, { data: vendors }, { data: products }] = await Promise.all([
    service.from('purchase_requests').select('id').eq('id', id).maybeSingle(),
    service
      .from('users')
      .select('id, display_name')
      .eq('is_active', true)
      .order('display_name', { ascending: true }),
    service
      .from('vendors')
      .select('id, vendor_code, name, tax_id, contact_person, phone, fax, contact_email, full_billing_address, payment_method, payment_terms, incoterms')
      .is('deleted_at', null)
      .order('vendor_code', { ascending: true })
      .limit(1000),
    service
      .from('products')
      .select('id, product_code, name, spec, purchase_unit')
      .is('deleted_at', null)
      .order('product_code', { ascending: true })
      .limit(1000),
  ])
  if (!doc) notFound()

  return (
    <PurchaseRequestDetailClient
      docId={id}
      users={(users as UserOption[]) ?? []}
      vendors={(vendors as VendorOption[]) ?? []}
      products={(products as ProductOption[]) ?? []}
    />
  )
}
