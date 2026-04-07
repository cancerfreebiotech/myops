// Settings keys grouped by owning role
export const HR_SETTINGS_KEYS = [
  'default_clock_in_time',
  'default_clock_out_time',
  'auto_clock_check_delay_minutes',
  'intern_missed_clock_alert_threshold',
  'fulltime_auto_clock_alert_days',
  'overtime_min_advance_hours',
] as const

export const FINANCE_SETTINGS_KEYS = [
  'payroll_pay_day',
  'payroll_auto_generate_day',
] as const

export const COO_SETTINGS_KEYS = [
  'project_ot_coo_threshold_hours',
  'contract_reminder_days_first',
  'contract_reminder_days_second',
] as const

// Map each key → which job_role owns (can edit) it
export const KEY_OWNER: Record<string, string> = {
  ...Object.fromEntries(HR_SETTINGS_KEYS.map(k => [k, 'hr_manager'])),
  ...Object.fromEntries(FINANCE_SETTINGS_KEYS.map(k => [k, 'finance'])),
  ...Object.fromEntries(COO_SETTINGS_KEYS.map(k => [k, 'coo'])),
}

export const ROLE_SETTINGS_KEYS = [
  ...HR_SETTINGS_KEYS,
  ...FINANCE_SETTINGS_KEYS,
  ...COO_SETTINGS_KEYS,
]
