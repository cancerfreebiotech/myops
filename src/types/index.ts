export type Role = 'member' | 'admin'

export type EmploymentType = 'full_time' | 'intern'

export type WorkRegion = 'TW' | 'JP' | 'US' | 'OTHER'

export type FeatureKey =
  | 'publish_announcement'
  | 'approve_contract'
  | 'export_signatures'
  | 'view_internal_dept'
  | 'hr_manager'
  | 'finance_payroll'
  | 'coo_notify'
  | 'manage_projects'

export interface User {
  id: string
  email: string
  display_name: string | null
  department_id: string | null
  role: Role
  granted_features: FeatureKey[]
  employment_type: EmploymentType
  work_region: WorkRegion
  manager_id: string | null
  deputy_approver_id: string | null
  job_title: string | null
  is_active: boolean
  language: string
  theme: string
  last_login_at: string | null
  created_at: string
}

export function hasFeature(
  role: string,
  grantedFeatures: string[],
  feature: FeatureKey
): boolean {
  if (role === 'admin') return true
  return grantedFeatures.includes(feature)
}
