import { createServiceClient } from '@/lib/supabase/server'

export const FEATURE_KEYS = [
  'attendance', 'leave', 'overtime', 'payroll',
  'documents', 'announcements', 'contracts', 'projects', 'feedback',
] as const

export type FeatureFlagKey = typeof FEATURE_KEYS[number]
export type FeatureFlags = Record<FeatureFlagKey, boolean>

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const service = await createServiceClient()
  const { data } = await service
    .from('system_settings')
    .select('key, value')
    .like('key', 'feature.%')

  const flags = Object.fromEntries(FEATURE_KEYS.map(k => [k, false])) as FeatureFlags

  for (const row of data ?? []) {
    const key = row.key.slice('feature.'.length) as FeatureFlagKey
    if ((FEATURE_KEYS as readonly string[]).includes(key)) {
      flags[key] = row.value === 'true'
    }
  }

  return flags
}

/** Returns true if the feature is accessible (admin always passes). */
export function canAccessFeature(
  role: string,
  flags: FeatureFlags,
  feature: FeatureFlagKey,
): boolean {
  if (role === 'admin') return true
  return flags[feature] === true
}
