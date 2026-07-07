import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 「待我審」範圍。leave_requests / overtime_requests 皆無 approver_id 欄位，
 * 審核者一律由 users.manager_id（直屬主管）與 projects.project_lead_id（專案負責人）判定，
 * 全域審核者則由角色 / feature 決定。此範圍供儀表板統計與簽核中心共用，確保兩處口徑一致。
 */
export interface ApprovalScope {
  /** 直屬下屬的 user id（applicant.manager_id = 我） */
  subordinateIds: string[]
  /** 我擔任負責人的專案 id（加班可由專案負責人審） */
  leadProjectIds: string[]
  /** 請假：admin 或 hr_manager 可審全部 pending */
  leaveApproveAll: boolean
  /** 加班：admin 或 coo_notify 可審全部 pending */
  overtimeApproveAll: boolean
}

export async function getApprovalScope(
  client: SupabaseClient,
  userId: string,
  role: string | null | undefined,
  features: string[],
): Promise<ApprovalScope> {
  const isAdmin = role === 'admin'
  const [{ data: subs }, { data: projs }] = await Promise.all([
    client.from('users').select('id').eq('manager_id', userId),
    client.from('projects').select('id').eq('project_lead_id', userId),
  ])
  return {
    subordinateIds: (subs ?? []).map((u: { id: string }) => u.id),
    leadProjectIds: (projs ?? []).map((p: { id: string }) => p.id),
    leaveApproveAll: isAdmin || features.includes('hr_manager'),
    overtimeApproveAll: isAdmin || features.includes('coo_notify'),
  }
}

/** 加班「待我審」的 PostgREST `.or()` 條件字串；無下屬且非任何專案負責人時回 null（代表空集合）。 */
export function overtimeScopeOrFilter(scope: ApprovalScope): string | null {
  const parts: string[] = []
  if (scope.subordinateIds.length) parts.push(`user_id.in.(${scope.subordinateIds.join(',')})`)
  if (scope.leadProjectIds.length) parts.push(`project_id.in.(${scope.leadProjectIds.join(',')})`)
  return parts.length ? parts.join(',') : null
}
