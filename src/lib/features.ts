export const FEATURE_KEYS = [
  'publish_announcement',
  'approve_contract',
  'export_signatures',
  'view_internal_dept',
  'hr_manager',
  'finance_payroll',
  'coo_notify',
  'manage_projects',
] as const

export type FeatureKey = typeof FEATURE_KEYS[number]
