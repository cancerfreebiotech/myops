// ============================================================
// Daily Report Module — Types & Supabase API Layer
// File: lib/daily-report/types.ts + api.ts
// ============================================================

// ── TYPES ────────────────────────────────────────────────────

export type Role = 'member' | 'manager'
export type Priority = 'high' | 'med' | 'low'
export type TaskStatus = 'active' | 'pending' | 'done'
export type KpiPeriod = 'monthly' | 'yearly'

export interface Profile {
  id: string
  email: string
  member_name: string | null   // e.g. 'Juno'
  display_name: string | null
  role: Role
  member_role_title: string | null  // e.g. '業務'
}

export interface ScheduleItem {
  label: string
  note: string
}

export interface DailySchedule {
  id: string
  profile_id: string
  date: string           // 'YYYY-MM-DD'
  items: ScheduleItem[]
}

export interface CompletionItem {
  label: string
  note: string
  done: boolean
}

export interface DailyCompletion {
  id: string
  profile_id: string
  date: string
  items: CompletionItem[]
}

export interface KpiEntry {
  id: string
  profile_id: string
  date: string
  kpi_def_id: string
  value: number
}

export interface KpiDefinition {
  id: string
  profile_id: string
  kpi_id: string
  cat: string
  name: string
  unit: string
  target: number
  period: KpiPeriod
  sort_order: number
}

export interface Task {
  id: string
  title: string
  content: string
  deadline: string | null
  priority: Priority
  status: TaskStatus
  member_done: boolean
  created_by: string | null
  created_at: string
  // joined
  assignees?: Profile[]
  subtasks?: TaskSubtask[]
}

export interface TaskSubtask {
  id: string
  task_id: string
  title: string
  done: boolean
  sort_order: number
}

export interface WorkItem {
  id: string
  profile_id: string
  label: string
  count_label: string
  sort_order: number
}

export interface SchItem {
  id: string
  profile_id: string
  label: string
  sort_order: number
}

// ── SUPABASE API LAYER ────────────────────────────────────────
// File: lib/daily-report/api.ts
// Usage: import { drApi } from '@/lib/daily-report/api'

import { createClient } from '@/lib/supabase/client'  // your existing client

const sb = () => createClient()

export const drApi = {

  // ── AUTH / PROFILE ─────────────────────────────────────────
  async getMyProfile(): Promise<Profile | null> {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return null
    const { data } = await sb()
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    return data
  },

  async getAllProfiles(): Promise<Profile[]> {
    const { data } = await sb()
      .from('profiles')
      .select('*')
      .not('member_name', 'is', null)
      .order('member_name')
    return data ?? []
  },

  // ── SCHEDULES ──────────────────────────────────────────────
  async getSchedule(profileId: string, date: string): Promise<DailySchedule | null> {
    const { data } = await sb()
      .from('daily_schedules')
      .select('*')
      .eq('profile_id', profileId)
      .eq('date', date)
      .single()
    return data
  },

  async getScheduleRange(profileId: string, from: string, to: string): Promise<DailySchedule[]> {
    const { data } = await sb()
      .from('daily_schedules')
      .select('*')
      .eq('profile_id', profileId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
    return data ?? []
  },

  async upsertSchedule(profileId: string, date: string, items: ScheduleItem[]): Promise<void> {
    await sb().from('daily_schedules').upsert({
      profile_id: profileId, date, items,
    }, { onConflict: 'profile_id,date' })
  },

  // ── COMPLETIONS ────────────────────────────────────────────
  async getCompletion(profileId: string, date: string): Promise<DailyCompletion | null> {
    const { data } = await sb()
      .from('daily_completions')
      .select('*')
      .eq('profile_id', profileId)
      .eq('date', date)
      .single()
    return data
  },

  async getCompletionRange(profileId: string, from: string, to: string): Promise<DailyCompletion[]> {
    const { data } = await sb()
      .from('daily_completions')
      .select('*')
      .eq('profile_id', profileId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
    return data ?? []
  },

  async upsertCompletion(profileId: string, date: string, items: CompletionItem[]): Promise<void> {
    await sb().from('daily_completions').upsert({
      profile_id: profileId, date, items,
    }, { onConflict: 'profile_id,date' })
  },

  // ── KPI ENTRIES ────────────────────────────────────────────
  async getKpiEntries(profileId: string, date: string): Promise<KpiEntry[]> {
    const { data } = await sb()
      .from('kpi_entries')
      .select('*')
      .eq('profile_id', profileId)
      .eq('date', date)
    return data ?? []
  },

  async getKpiEntriesRange(profileId: string, from: string, to: string): Promise<KpiEntry[]> {
    const { data } = await sb()
      .from('kpi_entries')
      .select('*')
      .eq('profile_id', profileId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
    return data ?? []
  },

  async upsertKpiEntry(profileId: string, date: string, kpiDefId: string, value: number): Promise<void> {
    await sb().from('kpi_entries').upsert({
      profile_id: profileId, date, kpi_def_id: kpiDefId, value,
    }, { onConflict: 'profile_id,date,kpi_def_id' })
  },

  // ── KPI DEFINITIONS ────────────────────────────────────────
  async getKpiDefinitions(profileId: string): Promise<KpiDefinition[]> {
    const { data } = await sb()
      .from('kpi_definitions')
      .select('*')
      .eq('profile_id', profileId)
      .order('sort_order')
    return data ?? []
  },

  async createKpiDefinition(def: Omit<KpiDefinition, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    await sb().from('kpi_definitions').insert(def)
  },

  async updateKpiDefinition(id: string, updates: Partial<KpiDefinition>): Promise<void> {
    await sb().from('kpi_definitions').update(updates).eq('id', id)
  },

  async deleteKpiDefinition(id: string): Promise<void> {
    await sb().from('kpi_definitions').delete().eq('id', id)
  },

  // ── TASKS ──────────────────────────────────────────────────
  async getTasks(): Promise<Task[]> {
    const { data } = await sb()
      .from('tasks')
      .select(`
        *,
        assignees:task_assignees(profile:profiles(*)),
        subtasks:task_subtasks(*)
      `)
      .order('created_at', { ascending: false })
    // reshape assignees
    return (data ?? []).map((t: any) => ({
      ...t,
      assignees: t.assignees?.map((a: any) => a.profile) ?? [],
      subtasks: (t.subtasks ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }))
  },

  async getMyTasks(profileId: string): Promise<Task[]> {
    const { data } = await sb()
      .from('tasks')
      .select(`
        *,
        assignees:task_assignees!inner(profile:profiles(*)),
        subtasks:task_subtasks(*)
      `)
      .eq('task_assignees.profile_id', profileId)
      .order('created_at', { ascending: false })
    return (data ?? []).map((t: any) => ({
      ...t,
      assignees: t.assignees?.map((a: any) => a.profile) ?? [],
      subtasks: (t.subtasks ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }))
  },

  async createTask(task: {
    title: string; content: string; deadline: string | null
    priority: Priority; assigneeIds: string[]
    subtitles: string[]  // subtask titles
  }): Promise<string> {
    const { data: t } = await sb().from('tasks').insert({
      title: task.title, content: task.content,
      deadline: task.deadline || null,
      priority: task.priority, status: 'active',
    }).select().single()
    if (!t) throw new Error('Task creation failed')

    if (task.assigneeIds.length) {
      await sb().from('task_assignees').insert(
        task.assigneeIds.map(pid => ({ task_id: t.id, profile_id: pid }))
      )
    }
    if (task.subtitles.length) {
      await sb().from('task_subtasks').insert(
        task.subtitles.map((title, i) => ({ task_id: t.id, title, done: false, sort_order: i }))
      )
    }
    return t.id
  },

  async updateTask(id: string, updates: Partial<Pick<Task, 'status' | 'member_done' | 'deadline' | 'priority'>>): Promise<void> {
    await sb().from('tasks').update(updates).eq('id', id)
  },

  async deleteTask(id: string): Promise<void> {
    await sb().from('tasks').delete().eq('id', id)
  },

  // ── SUBTASKS ───────────────────────────────────────────────
  async updateSubtask(id: string, done: boolean): Promise<void> {
    await sb().from('task_subtasks').update({ done }).eq('id', id)
  },

  async addSubtask(taskId: string, title: string, sortOrder: number): Promise<void> {
    await sb().from('task_subtasks').insert({ task_id: taskId, title, done: false, sort_order: sortOrder })
  },

  async deleteSubtask(id: string): Promise<void> {
    await sb().from('task_subtasks').delete().eq('id', id)
  },

  // ── WORK ITEMS ─────────────────────────────────────────────
  async getWorkItems(profileId: string): Promise<WorkItem[]> {
    const { data } = await sb()
      .from('work_items')
      .select('*')
      .eq('profile_id', profileId)
      .order('sort_order')
    return data ?? []
  },

  async createWorkItem(profileId: string, label: string, countLabel: string, sortOrder: number): Promise<void> {
    await sb().from('work_items').insert({ profile_id: profileId, label, count_label: countLabel, sort_order: sortOrder })
  },

  async updateWorkItem(id: string, label: string, countLabel: string): Promise<void> {
    await sb().from('work_items').update({ label, count_label: countLabel }).eq('id', id)
  },

  async deleteWorkItem(id: string): Promise<void> {
    await sb().from('work_items').delete().eq('id', id)
  },

  // ── SCH ITEMS ──────────────────────────────────────────────
  async getSchItems(profileId: string): Promise<SchItem[]> {
    const { data } = await sb()
      .from('sch_items')
      .select('*')
      .eq('profile_id', profileId)
      .order('sort_order')
    return data ?? []
  },

  async createSchItem(profileId: string, label: string, sortOrder: number): Promise<void> {
    await sb().from('sch_items').insert({ profile_id: profileId, label, sort_order: sortOrder })
  },

  async deleteSchItem(id: string): Promise<void> {
    await sb().from('sch_items').delete().eq('id', id)
  },

  // ── MANAGER: ALL DATA FOR EXPORT ───────────────────────────
  async getAllDataForExport(from: string, to: string, profileIds: string[]) {
    const [schedules, completions, kpiEntries, tasks] = await Promise.all([
      sb().from('daily_schedules').select('*').in('profile_id', profileIds).gte('date', from).lte('date', to),
      sb().from('daily_completions').select('*').in('profile_id', profileIds).gte('date', from).lte('date', to),
      sb().from('kpi_entries').select('*').in('profile_id', profileIds).gte('date', from).lte('date', to),
      sb().from('tasks').select(`*, assignees:task_assignees(profile_id), subtasks:task_subtasks(*)`),
    ])
    return {
      schedules: schedules.data ?? [],
      completions: completions.data ?? [],
      kpiEntries: kpiEntries.data ?? [],
      tasks: tasks.data ?? [],
    }
  },
}

// ============================================================
// CONSTANTS — Default data (mirrors original system)
// File: lib/daily-report/defaults.ts
// ============================================================

export const DEFAULT_SCH_ITEMS: Record<string, string[]> = {
  Juno: ['醫師拜訪','客戶電話回訪','新客戶開發','報價單整理','CRM資料更新','訂單追蹤','業績報表','業務會議'],
  Luna: ['檢測流程確認','報告寄送','訂單處理','客戶詢價回覆','物料庫存盤點','會議記錄','廠商聯絡'],
  Lucia: ['醫師/科室拜訪','學術文獻提供','演講/研討會安排','拜訪紀錄更新','B2B里程碑確認','客戶滿意度追蹤'],
  Ian: ['客戶拜訪（業務）','B2B里程碑確認','藥廠關係維護','期中/結案報告','跨部門協作'],
  Ana: ['活動籌備執行','活動出席率確認','行銷素材提供','官網平台推進','兒癌個管行政','病人案例整理'],
  Heather: ['IRB送件確認','收案進度更新','EDC填寫確認','試驗文件建檔','病友活動協調','個管個案追蹤'],
}

export const DEFAULT_WORK_ITEMS: Record<string, Array<{label:string;count_label:string}>> = {
  Juno: [
    {label:'拜訪客戶/回訪電話',count_label:''},
    {label:'更新客戶資料與CRM',count_label:''},
    {label:'整理報價單與合約',count_label:''},
    {label:'追蹤訂單與出貨進度',count_label:''},
  ],
  Luna: [
    {label:'處理檢測流程相關作業',count_label:''},
    {label:'確認報告寄送完整性',count_label:''},
    {label:'回覆客戶詢價與報價',count_label:''},
    {label:'管理樣品與宣傳物料',count_label:''},
  ],
  Lucia: [
    {label:'拜訪醫師/醫院科室',count_label:''},
    {label:'提供學術資訊與文獻',count_label:''},
    {label:'確認B2B專案里程碑',count_label:''},
    {label:'維護客戶關係',count_label:''},
  ],
  Ian: [
    {label:'業務拜訪（50%工時）',count_label:''},
    {label:'藥廠關係維護',count_label:''},
    {label:'撰寫期中/結案報告',count_label:''},
    {label:'跨部門協作',count_label:''},
  ],
  Ana: [
    {label:'個管活動籌備與執行',count_label:''},
    {label:'追蹤活動出席率',count_label:''},
    {label:'提供行銷部素材',count_label:''},
    {label:'推進官網購物平台',count_label:''},
  ],
  Heather: [
    {label:'確認IRB申請時程',count_label:''},
    {label:'更新收案進度',count_label:''},
    {label:'確認EDC填寫完整',count_label:''},
    {label:'維護試驗文件建檔',count_label:''},
  ],
}

export const DEFAULT_KPI_DEFS: Record<string, Omit<KpiDefinition,'id'|'created_at'|'updated_at'|'profile_id'>[]> = {
  Juno: [
    {kpi_id:'j1',cat:'量化',name:'每日拜訪數',unit:'次',target:50,period:'monthly',sort_order:0},
    {kpi_id:'j2',cat:'量化',name:'新客戶開發數',unit:'家',target:5,period:'monthly',sort_order:1},
  ],
  Luna: [],
  Lucia: [],
  Ian: [
    {kpi_id:'i1',cat:'業務',name:'每日拜訪數',unit:'次',target:20,period:'monthly',sort_order:0},
  ],
  Ana: [
    {kpi_id:'a1',cat:'個管',name:'提供行銷部素材病人數',unit:'人',target:5,period:'monthly',sort_order:0},
    {kpi_id:'a2',cat:'個管',name:'提供Lucia素材病人數',unit:'人',target:8,period:'monthly',sort_order:1},
  ],
  Heather: [
    {kpi_id:'h1',cat:'個管',name:'提供行銷部素材病人數',unit:'人',target:3,period:'monthly',sort_order:0},
    {kpi_id:'h2',cat:'個管',name:'提供Lucia素材病人數',unit:'人',target:4,period:'monthly',sort_order:1},
  ],
}

// ============================================================
// SEED SCRIPT — Run once to populate defaults for each member
// File: scripts/seed-daily-report.ts
// Usage: npx ts-node scripts/seed-daily-report.ts
// ============================================================
/*
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_SCH_ITEMS, DEFAULT_WORK_ITEMS, DEFAULT_KPI_DEFS } from '../lib/daily-report/defaults'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function seed() {
  const { data: profiles } = await sb.from('profiles').select('*').not('member_name','is',null)
  if (!profiles) return

  for (const p of profiles) {
    const mn = p.member_name
    if (!mn) continue
    console.log(`Seeding ${mn}...`)

    // Sch items
    const schItems = (DEFAULT_SCH_ITEMS[mn] ?? []).map((label, i) => ({
      profile_id: p.id, label, sort_order: i,
    }))
    if (schItems.length) await sb.from('sch_items').upsert(schItems, { onConflict: 'id' })

    // Work items
    const workItems = (DEFAULT_WORK_ITEMS[mn] ?? []).map((w, i) => ({
      profile_id: p.id, label: w.label, count_label: w.count_label, sort_order: i,
    }))
    if (workItems.length) await sb.from('work_items').upsert(workItems, { onConflict: 'id' })

    // KPI defs
    const kpiDefs = (DEFAULT_KPI_DEFS[mn] ?? []).map(d => ({ ...d, profile_id: p.id }))
    if (kpiDefs.length) await sb.from('kpi_definitions').upsert(kpiDefs, { onConflict: 'profile_id,kpi_id' })
  }
  console.log('Done!')
}
seed().catch(console.error)
*/
