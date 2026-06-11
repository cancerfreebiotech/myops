import type { JobRole } from '@/types'

/**
 * Default features each job_role receives automatically.
 * Admin always has full access regardless of this map.
 * Users can also receive extra features via granted_features.
 */
export const JOB_ROLE_DEFAULT_FEATURES: Record<JobRole, string[]> = {
  member: [],
  hr_manager: [
    'publish_announcement',
    'view_internal_dept',
    'attendance_manage',
    'leave_approve',
    'overtime_approve',
    'bonuses_manage',
    'reports_view',
  ],
  finance: [
    'view_internal_dept',
    'payroll_view',
    'reports_view',
    'procurement_payment_approve',
  ],
  coo: [
    'publish_announcement',
    'approve_contract',
    'view_internal_dept',
    'manage_projects',
    'overtime_approve',
    'payroll_view',
    'reports_view',
  ],
  ceo: [
    'publish_announcement',
    'approve_contract',
    'view_internal_dept',
    'manage_projects',
    'overtime_approve',
    'payroll_view',
    'reports_view',
    'procurement_unit',
    'procurement_manage',
    'procurement_payment_approve',
  ],
}

/**
 * Check if a user has a given feature, considering:
 * 1. Admin role → always true
 * 2. job_role default features
 * 3. individually granted extra features
 */
export function userHasFeature(
  role: string,
  jobRole: string,
  grantedFeatures: string[],
  feature: string
): boolean {
  if (role === 'admin') return true
  const defaults = JOB_ROLE_DEFAULT_FEATURES[jobRole as JobRole] ?? []
  return defaults.includes(feature) || grantedFeatures.includes(feature)
}

/** Check if user can access a job-role settings page */
export function canAccessJobRoleSettings(
  role: string,
  jobRole: string,
  targetRole: JobRole
): boolean {
  if (role === 'admin') return true
  return jobRole === targetRole
}
