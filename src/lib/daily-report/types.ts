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
