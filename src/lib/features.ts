// Individual feature keys that can be assigned to any user
// regardless of their job_role.
//
// IMPORTANT: every key here MUST be enforced somewhere — either by
// application code (granted_features?.includes('...') / userHasFeature())
// or by a Postgres RLS policy (has_feature('...')). Do not add a key that
// no layer checks, or the admin toggle silently does nothing.
export const FEATURE_KEYS = [
  // documents / announcements
  'publish_announcement',   // TS + RLS
  'approve_contract',       // TS + RLS
  // projects
  'manage_projects',        // RLS (projects write)
  // expenses / assets
  'expense_approve',        // TS + RLS
  'asset_manage',           // TS + RLS
  // procurement
  'procurement_unit',       // TS + RLS
  'procurement_manage',     // TS + RLS
  'procurement_payment_approve', // TS (approval flows)
  // HR / finance / payroll
  'hr_manager',             // TS + RLS
  'finance_payroll',        // TS + RLS
  'view_payroll',           // TS (payroll pages/api)
  'confirm_payroll',        // TS (finance confirm stage)
  'approve_payroll',        // TS (coo approve stage)
] as const

export type FeatureKey = typeof FEATURE_KEYS[number]
