export type DrRole = 'member' | 'viewer'
export type DrPriority = 'high' | 'med' | 'low'
export type DrTaskStatus = 'active' | 'pending' | 'done'
export type DrKpiPeriod = 'monthly' | 'yearly'

export interface DrGroup {
  id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
  deleted_at: string | null
}

export interface DrGroupMember {
  group_id: string
  user_id: string
  role: DrRole
  user?: { id: string; display_name: string | null; email: string }
}

export interface DrScheduleItem {
  label: string
  note: string
  /** 穩定識別碼（client 產生），用於與完成回報項目同步；舊資料可能沒有 */
  sid?: string
  /** 是否已完成（在今日行程分頁勾選，會同步到 daily_completions） */
  done?: boolean
}

export interface DrSchedule {
  id: string
  user_id: string
  date: string
  items: DrScheduleItem[]
}

export interface DrCompletionItem {
  label: string
  note: string
  done: boolean
  /** 有值 = 由今日行程同步而來（對應 DrScheduleItem.sid）；無值 = 手動新增的行程外事項 */
  sid?: string
}

export interface DrCompletion {
  id: string
  user_id: string
  date: string
  items: DrCompletionItem[]
}

export interface DrKpiDefinition {
  id: string
  user_id: string
  kpi_id: string
  cat: string
  name: string
  unit: string
  target: number
  period: DrKpiPeriod
  sort_order: number
}

export interface DrKpiEntry {
  id: string
  user_id: string
  date: string
  kpi_def_id: string
  value: number
}

export interface DrTask {
  id: string
  title: string
  content: string
  deadline: string | null
  priority: DrPriority
  status: DrTaskStatus
  member_done: boolean
  created_by: string | null
  created_at: string
  assignees?: { id: string; display_name: string | null; email: string }[]
  subtasks?: DrTaskSubtask[]
}

export interface DrTaskSubtask {
  id: string
  task_id: string
  title: string
  done: boolean
  sort_order: number
}

export interface DrWorkItem {
  id: string
  user_id: string
  label: string
  count_label: string
  sort_order: number
}

export interface DrSchItem {
  id: string
  user_id: string
  label: string
  sort_order: number
}
