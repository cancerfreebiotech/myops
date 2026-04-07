// Individual feature keys that can be assigned to any user
// regardless of their job_role
export const FEATURE_KEYS = [
  'publish_announcement',
  'approve_contract',
  'export_signatures',
  'view_internal_dept',
  'manage_projects',
  'attendance_manage',
  'leave_approve',
  'overtime_approve',
  'payroll_view',
  'bonuses_manage',
  'reports_view',
  'feedback_admin',
] as const

export type FeatureKey = typeof FEATURE_KEYS[number]
