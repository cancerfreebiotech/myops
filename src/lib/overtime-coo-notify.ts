import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { sendProactiveMessage } from '@/lib/teams-bot'
import { teamsText } from '@/lib/teams-i18n'

type Service = Awaited<ReturnType<typeof createServiceClient>>

export interface OvertimeNotifyInfo {
  /** 加班申請人 user_id */
  applicantId: string
  /** 專案 id（可為 null，理論上專案加班應有值） */
  projectId: string | null
  /** 本筆加班時數（overtime_requests.hours） */
  hours: number
  /** 加班日期 YYYY-MM-DD（overtime_requests.ot_date） */
  otDate: string
}

/**
 * B7 專案加班營運長超額通知。
 *
 * 讀 system_settings.project_ot_coo_threshold_hours（text）作為門檻（小時）。
 * 當本筆專案加班 hours 嚴格大於門檻時，透過 Teams 通知所有在職 job_role='coo'
 * 的使用者（各以自己的語言）。純唯讀提醒，永不 throw（呼叫端仍以 try/catch 包覆）。
 *
 * 設計注記：
 *  - 門檻未設定 / 非正數 → 不通知（fail-safe：不打擾）。
 *  - 收件人若同時為申請人本人，跳過（避免自己通知自己）。
 *  - service 由呼叫端傳入（POST 帶 cookie 的使用者身分 client 即可讀 system_settings/
 *    users/projects；sendProactiveMessage 內部另建 service client 解析 email）。
 */
export async function notifyCooOverThreshold(
  _service: Service,
  ot: OvertimeNotifyInfo,
): Promise<void> {
  // 用真 service-role client：system_settings 非 feature.* key 僅 admin 可讀，
  // 帶使用者身分的 service 會讀不到門檻（RLS 擋 → 一般員工的專案加班永遠不通知 COO）。
  const admin = createAdminClient()

  // 1) 讀門檻
  const { data: setting } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'project_ot_coo_threshold_hours')
    .maybeSingle()
  const threshold = parseFloat(setting?.value ?? '')
  if (!Number.isFinite(threshold) || threshold <= 0) return
  if (!(ot.hours > threshold)) return

  // 2) 找出所有在職 COO
  const { data: coos } = await admin
    .from('users')
    .select('id, language')
    .eq('is_active', true)
    .eq('job_role', 'coo')
  if (!coos || coos.length === 0) return

  // 3) 訊息素材：申請人姓名、專案名稱
  const { data: applicant } = await admin
    .from('users')
    .select('display_name')
    .eq('id', ot.applicantId)
    .maybeSingle()
  let projectName = '-'
  if (ot.projectId) {
    const { data: proj } = await admin
      .from('projects')
      .select('name')
      .eq('id', ot.projectId)
      .maybeSingle()
    projectName = proj?.name ?? '-'
  }

  // 4) 逐一通知（sendProactiveMessage 內建 per-item 隔離、永不 throw）
  for (const coo of coos) {
    if (coo.id === ot.applicantId) continue
    const text = teamsText(coo.language, 'projectOtCooAlert', {
      name: applicant?.display_name ?? '-',
      project: projectName,
      hours: ot.hours,
      threshold,
      date: ot.otDate,
    })
    await sendProactiveMessage(coo.id, text)
  }
}
