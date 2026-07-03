export type Role = 'member' | 'admin'

export type JobRole = 'member' | 'hr_manager' | 'finance' | 'coo' | 'ceo'

export type EmploymentType = 'full_time' | 'intern'

export type WorkRegion = 'TW' | 'JP' | 'US' | 'OTHER'

// Single source of truth for assignable feature keys lives in @/lib/features.
import type { FeatureKey } from '@/lib/features'
export type { FeatureKey }

export interface User {
  id: string
  email: string
  display_name: string | null
  department_id: string | null
  role: Role
  job_role: JobRole
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
  jobRole: string,
  grantedFeatures: string[],
  feature: FeatureKey
): boolean {
  if (role === 'admin') return true
  return grantedFeatures.includes(feature)
}
