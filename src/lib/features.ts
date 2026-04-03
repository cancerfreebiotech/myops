export const FEATURE_KEYS = [
  { key: 'publish_announcement', label: '發布公告' },
  { key: 'approve_contract', label: '審核合約' },
  { key: 'export_signatures', label: '匯出簽署清單' },
  { key: 'view_internal_dept', label: '查看部門內部文件' },
  { key: 'hr_manager', label: 'HR 主管' },
  { key: 'finance_payroll', label: '財務薪資' },
  { key: 'coo_notify', label: '營運長通知' },
  { key: 'manage_projects', label: '管理專案' },
] as const

export type FeatureKey = typeof FEATURE_KEYS[number]['key']
