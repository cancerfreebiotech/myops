// Client-safe: constants and types only, no server imports

export const FEATURE_KEYS = [
  'attendance', 'leave', 'overtime', 'payroll',
  'documents', 'announcements', 'contracts', 'projects', 'feedback',
  'procurement', 'daily_report', 'expenses', 'approvals', 'assets', 'training', 'business_trip', 'calendar', 'insights', 'ask_ai', 'lifecycle',
] as const

export type FeatureFlagKey = typeof FEATURE_KEYS[number]
export type FeatureFlags = Record<FeatureFlagKey, boolean>
