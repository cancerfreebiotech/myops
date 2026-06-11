import { createClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/job-role-features'

// Shared helpers for the procurement products / vendor-products API routes.

export const PRODUCT_WRITABLE_FIELDS = [
  'product_code', 'name', 'spec', 'category', 'product_type', 'brand',
  'primary_source', 'item_code', 'image_url', 'description', 'default_department',
  'purchase_unit', 'stock_unit', 'units_per_purchase',
] as const

export type ProductPayload = Record<string, unknown>

/** Whitelist body fields; empty strings are normalized to null. */
export function pickWritable(body: Record<string, unknown>): ProductPayload {
  const payload: ProductPayload = {}
  for (const field of PRODUCT_WRITABLE_FIELDS) {
    if (field in body) {
      const value = body[field]
      payload[field] = typeof value === 'string' && value.trim() === '' ? null : value
    }
  }
  return payload
}

/** Read = procurement_unit | procurement_manage | admin; write = procurement_manage | admin. */
export async function getProcurementAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data: currentUser } = await supabase
    .from('users')
    .select('role, job_role, granted_features')
    .eq('id', userId)
    .single()

  const role = currentUser?.role ?? ''
  const jobRole = currentUser?.job_role ?? ''
  const granted = (currentUser?.granted_features as string[] | null) ?? []

  return {
    canRead:
      userHasFeature(role, jobRole, granted, 'procurement_unit') ||
      userHasFeature(role, jobRole, granted, 'procurement_manage'),
    canWrite: userHasFeature(role, jobRole, granted, 'procurement_manage'),
  }
}

/** Escape %/_ for use inside a PostgREST ilike pattern. */
export function escapeLike(value: string): string {
  return value.replaceAll('%', '\\%').replaceAll('_', '\\_')
}
