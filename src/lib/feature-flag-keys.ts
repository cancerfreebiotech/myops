// Client-safe: constants and types only, no server imports

export const FEATURE_KEYS = [
  'attendance', 'leave', 'overtime', 'payroll',
  'documents', 'announcements', 'contracts', 'projects', 'feedback',
  'procurement', 'daily_report',
] as const

export type FeatureFlagKey = typeof FEATURE_KEYS[number]
export type FeatureFlags = Record<FeatureFlagKey, boolean>
