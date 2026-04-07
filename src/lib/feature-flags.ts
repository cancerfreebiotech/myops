import { createServiceClient } from '@/lib/supabase/server'
import { FEATURE_KEYS } from '@/lib/feature-flag-keys'
import type { FeatureFlagKey, FeatureFlags } from '@/lib/feature-flag-keys'
export { FEATURE_KEYS } from '@/lib/feature-flag-keys'
export type { FeatureFlagKey, FeatureFlags } from '@/lib/feature-flag-keys'

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
