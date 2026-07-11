'use client'

import { useLocale } from 'next-intl'
import Link from 'next/link'
import { AskAiBox } from '@/components/AskAiBox'
import {
  LayoutDashboard, Clock, CalendarDays, Timer, DollarSign,
  FolderKanban, FileText, Megaphone, FileSignature,
  MessageSquarePlus, Settings, ExternalLink, ShieldCheck,
  CheckSquare, CalendarRange, BarChart3, ClipboardList, ListChecks,
  UsersRound, Plane, Receipt, GraduationCap, Target,
  ShoppingCart, Package, FlaskConical,
} from 'lucide-react'

type Module = {
  icon: React.ElementType
  href: string
  title: string
  desc: string
  features: string[]
  access?: string
}

type MatrixRow = { feature: string; employee: boolean | string; manager: boolean | string; hr: boolean | string; admin: boolean | string; note?: string }
type MatrixSection = { name: string; rows: MatrixRow[] }
type Category = { name: string; modules: Module[] }
type PageContent = {
  title: string
  subtitle: string
  categories: Category[]
  matrixTitle: string
  matrixSubtitle: string
  matrixLegend: string
  matrixRoles: { employee: string; manager: string; hr: string; admin: string }
  matrixSections: MatrixSection[]
}

const CONTENT: Record<string, PageContent> = {
  'zh-TW': {
    title: '說明文件',
    subtitle: '瞭解 myOPS 各功能模組的使用方式',
    categories: [
      {
        name: '一般',
        modules: [
          {
            icon: LayoutDashboard,
            href: '/',
            title: '總覽',
            desc: '登入後的首頁，提供今日工作狀況的快速概覽。',
            features: [
              '顯示未讀公告數量',
              '待審請假、加班、報支等申請件數提醒',
              '今日打卡狀態',
              '快速入口：打卡、請假、加班申請',
              '證照 / 校驗保養將到期卡片（具對應管理權限時）',
            ],
          },
          {
            icon: CheckSquare,
            href: '/approvals',
            title: '簽核中心',
            desc: '集中所有待你審核的申請，一頁核准或退回，不用逐頁巡。',
            features: [
              '彙總待審：請假、加班、補打卡、報支、文件 / 合約、薪資、採購、出差',
              '一鍵核准或退回（退回需填原因）',
              '顯示申請人、類型、日期與金額',
              '金額型單據與敏感操作需 MFA 驗證',
              '亦可依管理員政策在 Teams 卡片上直接核准',
            ],
            access: '審核：依各申請類型的審核權限',
          },
          {
            icon: CalendarRange,
            href: '/calendar',
            title: '公司行事曆',
            desc: '一頁月曆彙總公司活動、已核准請假與出差。',
            features: [
              '公司活動（綠）、已核准請假（藍）、已核准出差（紫）',
              '點選日期查看當日完整清單',
              '一般員工的請假僅顯示同部門與必要資訊（姓名、日期、假別）',
              'HR / 管理員可建立與管理公司活動',
              '請假 / 出差核准後自動於當事人 Outlook 建立整天「不在辦公室」事件（單向同步，首次需重新登入授權）',
            ],
            access: '查看：所有員工　活動管理：HR / 管理員',
          },
          {
            icon: BarChart3,
            href: '/insights',
            title: '營運儀表板',
            desc: '全公司營運指標的彙總分析（管理員限定）。',
            features: [
              '本月出勤與加班摘要、年度請假與報帳合計',
              '近 6 個月加班時數、出勤人日、請購金額趨勢',
              '請假假別 / 報帳類別 / 專案加班分布圖',
              '統計以台北時區計算',
            ],
            access: '管理員限定',
          },
        ],
      },
      {
        name: '每日報告',
        modules: [
          {
            icon: ClipboardList,
            href: '/daily-report',
            title: '每日填報',
            desc: '直接在 myOPS 填報每日行程、完成回報與 KPI。',
            features: [
              '行程 / 完成回報 / KPI 三個分頁',
              '一鍵套用常用樣板',
              '「今天」以台北時間計算，跨時區不會差一天',
              'KPI 清空欄位不會誤存為 0',
            ],
          },
          {
            icon: ListChecks,
            href: '/daily-report/tasks',
            title: '我的任務',
            desc: '查看並回報主管指派的任務與子任務。',
            features: [
              '查看主管指派的任務與子任務',
              '逐項勾選子任務並儲存',
              '完成後直接標記回報',
            ],
          },
          {
            icon: UsersRound,
            href: '/daily-report/team',
            title: '團隊總覽',
            desc: '主管檢視所屬群組成員的當日報告。',
            features: [
              '群組主管（Viewer）查看群組所有成員的當日報告',
              '依群組彙總',
              '群組由管理員於「報告群組管理」建立與指派',
            ],
            access: '查看：群組主管 / 管理員',
          },
        ],
      },
      {
        name: '人事管理',
        modules: [
          {
            icon: Clock,
            href: '/attendance',
            title: '打卡',
            desc: '上下班打卡及出勤記錄管理。',
            features: [
              '一鍵上班打卡 / 下班打卡',
              '查看本月打卡記錄與工時統計',
              '申請補打卡（需填原因，經主管核准後寫入當日記錄）',
              '彈性班別：遲到以你當日班別的上班時間判定（未指派者沿用預設）',
              'GPS 地理圍欄：管理員開啟強制範圍檢查後，超出允許辦公室範圍將無法打卡（預設關閉，僅記錄座標）',
            ],
            access: '打卡：所有員工　全員出勤查看：HR / 管理員',
          },
          {
            icon: CalendarDays,
            href: '/leave',
            title: '請假',
            desc: '申請各類假別，查看假期餘額與請假紀錄。',
            features: [
              '支援多種假別（年假、病假、事假、特休等）',
              '查看可用假期餘額',
              '月曆視圖查看本人及團隊請假',
              '審核流程：送出 → 主管核准 / 退回（需填原因）',
              '已核准的請假可申請取消',
              '核准後自動於 Outlook 建立整天「不在辦公室」事件（首次需重新登入授權）',
            ],
            access: '申請：所有員工　審核：主管 / HR / 管理員',
          },
          {
            icon: Timer,
            href: '/overtime',
            title: '加班',
            desc: '申請加班時數，加班費依勞基法分段計算。',
            features: [
              '填寫加班日期、時段（起訖時間）與說明',
              '加班日別（工作日 / 休息日 / 國定假日）依日期自動判斷（週六日＝休息日），國定假日可手動選擇',
              '可關聯至指定專案',
              '審核流程：送出 → 主管 → HR → 核准',
              '已核准加班依勞基法 §24/§39 分段計薪（工作日、休息日、國定假日倍率不同），計入薪資',
            ],
            access: '申請：所有員工　審核：主管 / HR / 管理員',
          },
          {
            icon: Plane,
            href: '/business-trips',
            title: '出差管理',
            desc: '出差申請與行程管理，核准後同步 Outlook。',
            features: [
              '填寫目的地、事由、行程 → 主管審批',
              '申請人可取消待審核的申請',
              '納入簽核中心一鍵核准 / 退回',
              '已核准出差可一鍵帶入報支表單（類別與事由預填）',
              '核准後自動於 Outlook 建立整天「不在辦公室」事件（首次需重新登入授權）',
            ],
            access: '申請：所有員工　審核：主管 / HR / 管理員',
          },
          {
            icon: Receipt,
            href: '/expenses',
            title: '員工報帳',
            desc: '代墊費用線上申請、核准與撥付。',
            features: [
              '選類別（交通 / 差旅 / 誤餐 / 用品 / 其他）',
              '上傳發票照片或 PDF',
              '送出後由具審批權限者核准與撥付（審批需 MFA）',
              '隨時查看進度、取消待審核的申請',
              '可關聯已核准出差；具報帳審核權限者可一鍵匯出 Excel 明細',
            ],
            access: '申請：所有員工　審批撥付：具報帳審批權限者',
          },
          {
            icon: DollarSign,
            href: '/payroll',
            title: '薪資',
            desc: '查看個人薪資明細與年度薪資報告。',
            features: [
              '每月薪資明細：底薪、加班費、獎金、扣項',
              '年度薪資彙總報告',
              '薪資狀態：草稿 → HR 審核 → 財務確認 → 營運長核准 → 已發薪',
            ],
            access: '查看：本人薪資　全員查看：HR / 財務 / 管理層（具 view_payroll）　確認/核准：具 confirm/approve_payroll 權限者 / Admin',
          },
          {
            icon: GraduationCap,
            href: '/training',
            title: '教育訓練',
            desc: '訓練課程指派與個人證照到期管理。',
            features: [
              '課程建立與指派（含教材連結、必修標記）',
              '員工標記完成並上傳結業證明',
              '年度累計時數統計與完成進度總覽',
              '證照登錄與到期追蹤（30 天內顯示「即將到期」）',
              '管理者「到期提醒」分頁列出 60 天內到期證照',
            ],
            access: '查看 / 完成：所有員工　課程與證照管理：具訓練管理權限者',
          },
          {
            icon: Target,
            href: '/performance',
            title: '績效考核',
            desc: '完整績效考核週期，從目標設定到主管評核。',
            features: [
              'HR 建立考核週期',
              '員工設定目標（權重合計 100%）→ 主管核定或退回',
              '員工逐目標自評（1–5 分）',
              '主管逐目標評分與總評（需 MFA）→ 完成鎖定結果',
              '完成時自動存入該期間每日報告 KPI 快照（目標 vs 實績）',
              'HR 可檢視全公司進度並重新開啟已完成考核',
            ],
            access: '目標 / 自評：本人　評核：主管　週期管理：HR',
          },
        ],
      },
      {
        name: '文件管理（DMS）',
        modules: [
          {
            icon: FileText,
            href: '/documents',
            title: '文件',
            desc: '集中管理公司各類文件，支援審核流程、AI 翻譯與 OCR 全文搜尋。',
            features: [
              '上傳文件（支援 PDF、Word、圖片等格式）',
              '依類型分類：ANN / REG / NDA / MOU / CONTRACT / AMEND / INTERNAL',
              '審核流程：上傳 → 待審 → 核准 / 退回 → 封存',
              'AI 翻譯：一鍵生成多語版本',
              '確認閱讀：追蹤重要文件的閱讀狀態',
              'OCR 全文搜尋：掃描 PDF / 圖片可一鍵抽取文字後供搜尋；AI 政策問答以語意檢索作答並附出處引用',
            ],
            access: '上傳：所有員工　核准：具文件審核權限者（approve_contract）/ Admin（需 MFA）',
          },
          {
            icon: Megaphone,
            href: '/announcements',
            title: '公告',
            desc: '查看公司公告與重要通知。',
            features: [
              '依類別標籤篩選（緊急 / 行政 / 法規 / HR）',
              '重要公告需點擊「確認已讀」',
              '未確認公告會顯示在儀表板提醒',
              '發布者可對尚未確認的同仁一鍵 Teams 催辦（附冷卻避免重複打擾）',
              '閱讀確認清單可匯出 Excel；提醒頻率依各公告設定',
            ],
            access: '查看：所有員工　發布：HR / Admin',
          },
          {
            icon: FileSignature,
            href: '/contracts',
            title: '合約',
            desc: '查看並管理公司對外合約。',
            features: [
              '合約類型：NDA / MOU / 合約 / 合約修正',
              '審核流程：待審 → 核准 / 退回（核准需 MFA）',
              '到期自動提醒：到期前 90 天與 30 天透過 Teams 提醒具審核權限者',
              '核准或退回後自動通知申請人；合約類另會知會營運長',
              '依公司、狀態、類型篩選',
            ],
            access: '查看 / 核准：Admin 或具合約審核權限者（approve_contract，如營運長）；核准需 MFA',
          },
        ],
      },
      {
        name: '專案',
        modules: [
          {
            icon: FolderKanban,
            href: '/projects',
            title: '專案',
            desc: '建立與管理專案，追蹤成員加班情形。',
            features: [
              '建立專案、指定負責人',
              '新增 / 管理專案成員',
              '查看專案相關加班申請',
              '專案加班時數超過門檻時自動通知營運長',
              '專案狀態：進行中 / 已結案',
            ],
            access: '建立：所有員工　成員管理：負責人 / Admin',
          },
        ],
      },
      {
        name: '採購',
        modules: [
          {
            icon: ShoppingCart,
            href: '/procurement',
            title: '採購',
            desc: '完整採購鏈，從請購到付款，並管理供應商、商品與庫存。',
            features: [
              '單據鏈：詢價 → 請採購 → 進貨驗收 → 入庫 / 出庫 → 請款',
              '多關卡簽核引擎（部門主管 / COO / CEO / 會計），核准需 MFA',
              '廠商 / 商品主檔與廠商 / 商品評鑑',
              '批號庫存與分類帳、近效期（60 天內）警示',
              '條碼掃描（掃描槍 / 手機相機）入出庫自動加減量',
              '已核准進貨驗收單可一鍵轉為資產；作廢已核准單據限管理者並需 MFA',
            ],
            access: '檢視：具採購權限者　簽核：對應簽核角色（採購作業 / 管理 / 請款核准）',
          },
        ],
      },
      {
        name: '資產管理',
        modules: [
          {
            icon: Package,
            href: '/assets',
            title: '資產管理',
            desc: '資產台帳與借用、保養、盤點記錄。',
            features: [
              '資產台帳（IT 設備 / 實驗儀器 / 傢俱）',
              '領用 / 歸還（自動更新保管人）',
              '保養 / 校驗 / 維修記錄（含附件），完成後自動排下次到期日',
              '「到期提醒」分頁列出 60 天內到期項目',
              '可由採購已核准的進貨驗收單一鍵轉入資產',
            ],
            access: '檢視：所有員工（唯讀）　異動：具資產管理權限者',
          },
          {
            icon: FlaskConical,
            href: '/lab',
            title: '試劑耗材',
            desc: '試劑與耗材的批號、效期與領用管理。',
            features: [
              '試劑與耗材品項與批次管理（批號 ＋ 效期）',
              '使用 / 開封 / 報廢異動記錄（庫存扣帳為原子交易）',
              '低庫存與效期到期提醒',
              '全員可查閱庫存',
            ],
            access: '查閱：所有員工　異動：具試劑耗材管理權限者',
          },
        ],
      },
      {
        name: '其他',
        modules: [
          {
            icon: MessageSquarePlus,
            href: '/feedback/new',
            title: '意見回饋',
            desc: '提交對公司的建議或意見（匿名）。',
            features: [
              '選擇回饋類別（工作環境、薪資福利、管理制度、其他）',
              '填寫詳細說明',
              '提交後為匿名，只有 Admin 可查看',
            ],
          },
          {
            icon: Settings,
            href: '/settings',
            title: '個人設定',
            desc: '管理個人偏好設定。',
            features: [
              '切換介面語言（繁體中文 / English / 日本語）',
              '切換深色 / 淺色模式',
              '管理雙因素驗證（MFA）',
            ],
          },
        ],
      },
    ],
    matrixTitle: '使用者功能矩陣',
    matrixSubtitle: '各角色的功能存取權限',
    matrixLegend: '✓ 有權限　— 無權限　△ 需特定授權',
    matrixRoles: { employee: '員工', manager: '主管', hr: 'HR', admin: 'Admin' },
    matrixSections: [
      {
        name: '簽核 / 行事曆',
        rows: [
          { feature: '簽核中心（核准 / 退回）', employee: false, manager: true, hr: true, admin: true },
          { feature: '查看行事曆', employee: true, manager: true, hr: true, admin: true },
          { feature: '管理公司活動', employee: false, manager: false, hr: true, admin: true },
          { feature: '營運儀表板', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: '出勤管理',
        rows: [
          { feature: '打卡（上/下班）', employee: true, manager: true, hr: true, admin: true },
          { feature: '補打卡申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '補打卡審核', employee: false, manager: true, hr: true, admin: true },
          { feature: '查看全員出勤', employee: false, manager: false, hr: true, admin: true },
        ],
      },
      {
        name: '請假 / 加班',
        rows: [
          { feature: '請假申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '請假審核', employee: false, manager: true, hr: true, admin: true },
          { feature: '加班申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '加班審核', employee: false, manager: true, hr: true, admin: true },
        ],
      },
      {
        name: '出差',
        rows: [
          { feature: '出差申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '出差審核', employee: false, manager: true, hr: true, admin: true },
        ],
      },
      {
        name: '報帳',
        rows: [
          { feature: '報帳申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '報帳審批 / 撥付', employee: false, manager: '△', hr: '△', admin: '△', note: '需 expense_approve 授權' },
        ],
      },
      {
        name: '薪資',
        rows: [
          { feature: '查看本人薪資', employee: true, manager: true, hr: true, admin: true },
          { feature: '查看全員薪資', employee: false, manager: false, hr: true, admin: true, note: '需 view_payroll 授權' },
          { feature: '薪資確認 / 核准', employee: false, manager: false, hr: false, admin: '△', note: '需 confirm/approve_payroll 授權' },
        ],
      },
      {
        name: '教育訓練 / 績效',
        rows: [
          { feature: '查看 / 完成訓練', employee: true, manager: true, hr: true, admin: true },
          { feature: '課程與證照管理', employee: false, manager: '△', hr: '△', admin: '△', note: '需 training_manage 授權' },
          { feature: '績效目標與自評', employee: true, manager: true, hr: true, admin: true },
          { feature: '績效評核 / 週期管理', employee: false, manager: '△', hr: true, admin: true, note: '主管評核 / HR 管理週期' },
        ],
      },
      {
        name: '每日報告',
        rows: [
          { feature: '填寫每日報告', employee: true, manager: true, hr: true, admin: true },
          { feature: '我的任務回報', employee: true, manager: true, hr: true, admin: true },
          { feature: '團隊總覽', employee: false, manager: '△', hr: false, admin: true, note: '群組主管可檢視' },
          { feature: '報告群組管理', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: '文件管理',
        rows: [
          { feature: '文件上傳', employee: true, manager: true, hr: true, admin: true },
          { feature: '文件審核', employee: false, manager: false, hr: '△', admin: true, note: '需 approve_contract 授權' },
          { feature: '文件 OCR 抽取', employee: false, manager: false, hr: '△', admin: true, note: '文件管理者' },
        ],
      },
      {
        name: '公告 / 合約',
        rows: [
          { feature: '查看公告', employee: true, manager: true, hr: true, admin: true },
          { feature: '發佈公告', employee: false, manager: false, hr: '△', admin: true, note: '需 publish_announcement 授權' },
          { feature: '查看合約', employee: false, manager: '△', hr: '△', admin: true, note: '需 approve_contract 授權' },
          { feature: '合約審核', employee: false, manager: false, hr: false, admin: '△', note: '需 approve_contract 授權' },
        ],
      },
      {
        name: '採購',
        rows: [
          { feature: '採購作業 / 建立單據', employee: false, manager: '△', hr: false, admin: '△', note: '需採購作業權限' },
          { feature: '採購簽核', employee: false, manager: '△', hr: false, admin: '△', note: '依簽核角色' },
          { feature: '請款核准', employee: false, manager: false, hr: false, admin: '△', note: '需請款核准權限' },
          { feature: '作廢已核准單據', employee: false, manager: false, hr: false, admin: '△', note: '需採購管理權限 + MFA' },
        ],
      },
      {
        name: '資產 / 試劑耗材',
        rows: [
          { feature: '查看資產 / 庫存', employee: true, manager: true, hr: true, admin: true },
          { feature: '資產異動管理', employee: false, manager: '△', hr: '△', admin: '△', note: '需 asset_manage 授權' },
          { feature: '試劑耗材異動', employee: false, manager: '△', hr: '△', admin: '△', note: '需試劑耗材管理權限' },
        ],
      },
      {
        name: '專案 / 其他',
        rows: [
          { feature: '建立專案', employee: true, manager: true, hr: true, admin: true },
          { feature: '專案成員管理', employee: false, manager: '△', hr: '△', admin: true, note: '專案負責人可管理' },
          { feature: '意見回饋（匿名）', employee: true, manager: true, hr: true, admin: true },
          { feature: '查看回饋', employee: false, manager: false, hr: false, admin: true },
          { feature: '管理後台', employee: false, manager: false, hr: false, admin: true },
        ],
      },
    ],
  },

  'en': {
    title: 'Help',
    subtitle: 'Learn how to use each feature in myOPS',
    categories: [
      {
        name: 'General',
        modules: [
          {
            icon: LayoutDashboard,
            href: '/',
            title: 'Dashboard',
            desc: 'Your home page after login — a quick overview of today\'s status.',
            features: [
              'Unread announcement count',
              'Pending leave / overtime / expense approval reminders',
              'Today\'s clock-in status',
              'Quick actions: clock in, apply leave, apply overtime',
              'Expiring certificate / calibration & maintenance cards (with the relevant management permission)',
            ],
          },
          {
            icon: CheckSquare,
            href: '/approvals',
            title: 'Approvals',
            desc: 'Every request awaiting your review, in one place — approve or reject without page-hopping.',
            features: [
              'Consolidates: leave, overtime, missed clock-in, expenses, documents / contracts, payroll, procurement, business trips',
              'One-tap approve or reject (reason required to reject)',
              'Shows applicant, type, date and amount',
              'Amount-based documents and sensitive actions require MFA',
              'Can also approve directly from a Teams card, per admin policy',
            ],
            access: 'Review: based on approval permission for each request type',
          },
          {
            icon: CalendarRange,
            href: '/calendar',
            title: 'Calendar',
            desc: 'A single monthly calendar of company events, approved leave and business trips.',
            features: [
              'Company events (green), approved leave (blue), approved trips (purple)',
              'Click a date to see the full list for that day',
              'For regular staff, leave shows only same-department entries and essential info (name, date, leave type)',
              'HR / Admin can create and manage company events',
              'Approved leave / trips auto-create an all-day "Out of Office" event on the person\'s Outlook (one-way sync; first use requires a re-login to authorize)',
            ],
            access: 'View: all staff　Event management: HR / Admin',
          },
          {
            icon: BarChart3,
            href: '/insights',
            title: 'Insights',
            desc: 'Company-wide operational metrics and analytics (Admin only).',
            features: [
              'This month\'s attendance & overtime summary, annual leave & expense totals',
              '6-month trends for overtime hours, attendance person-days and purchase amounts',
              'Distribution charts for leave types / expense categories / project overtime',
              'Statistics computed in Taipei time zone',
            ],
            access: 'Admin only',
          },
        ],
      },
      {
        name: 'Daily Report',
        modules: [
          {
            icon: ClipboardList,
            href: '/daily-report',
            title: 'My Daily Report',
            desc: 'File your daily schedule, completion notes and KPIs directly in myOPS.',
            features: [
              'Three tabs: Schedule / Completion / KPI',
              'Apply a saved template with one tap',
              '"Today" is computed in Taipei time — no off-by-one across time zones',
              'Clearing a KPI field is not saved as 0 by mistake',
            ],
          },
          {
            icon: ListChecks,
            href: '/daily-report/tasks',
            title: 'My Tasks',
            desc: 'View and report on tasks and subtasks assigned by your manager.',
            features: [
              'View tasks and subtasks assigned by your manager',
              'Check off subtasks and save',
              'Mark a task complete to report back',
            ],
          },
          {
            icon: UsersRound,
            href: '/daily-report/team',
            title: 'Team Overview',
            desc: 'Managers review the daily reports of members in their group.',
            features: [
              'Group leads (Viewers) see the daily reports of all group members',
              'Aggregated by group',
              'Groups are created and assigned by Admin under "Report Groups"',
            ],
            access: 'View: group leads / Admin',
          },
        ],
      },
      {
        name: 'HR Management',
        modules: [
          {
            icon: Clock,
            href: '/attendance',
            title: 'Attendance',
            desc: 'Clock in/out and view attendance records.',
            features: [
              'One-tap clock in / clock out',
              'View this month\'s attendance and working hours',
              'Apply for a missed clock (reason required; written to the day\'s record after manager approval)',
              'Flexible shifts: lateness is judged against your assigned shift\'s start time (default start time if unassigned)',
              'GPS geofence: when the admin enables enforced range checks, clocking in outside all allowed offices is blocked (off by default — coordinates recorded only)',
            ],
            access: 'Clock: all staff　View all attendance: HR / Admin',
          },
          {
            icon: CalendarDays,
            href: '/leave',
            title: 'Leave',
            desc: 'Apply for leave, view balances and records.',
            features: [
              'Multiple leave types (annual, sick, personal, etc.)',
              'View remaining leave balances',
              'Calendar view of personal and team leave',
              'Approval flow: Submit → Manager approve / reject (reason required)',
              'Approved leave can be cancelled',
              'Once approved, an all-day "Out of Office" event is auto-created on Outlook (first use requires a re-login to authorize)',
            ],
            access: 'Apply: all staff　Approve: Manager / HR / Admin',
          },
          {
            icon: Timer,
            href: '/overtime',
            title: 'Overtime',
            desc: 'Apply for overtime hours; pay is calculated in tiers per labor law.',
            features: [
              'Enter date, time range, and description',
              'Overtime day type (workday / rest day / public holiday) is auto-detected from the date (Sat/Sun = rest day); public holidays can be selected manually',
              'Link to a specific project',
              'Approval flow: Submit → Manager → HR → Approved',
              'Approved overtime is paid in tiers per Labor Standards Act §24/§39 (workday / rest day / public holiday use different multipliers) and included in payroll',
            ],
            access: 'Apply: all staff　Approve: Manager / HR / Admin',
          },
          {
            icon: Plane,
            href: '/business-trips',
            title: 'Business Trips',
            desc: 'Apply for trips and manage itineraries; syncs to Outlook once approved.',
            features: [
              'Enter destination, purpose, itinerary → manager approval',
              'Applicant can cancel a pending request',
              'Included in Approvals for one-tap approve / reject',
              'Approved trips prefill the expense form (category and purpose auto-filled)',
              'Once approved, an all-day "Out of Office" event is auto-created on Outlook (first use requires a re-login to authorize)',
            ],
            access: 'Apply: all staff　Approve: Manager / HR / Admin',
          },
          {
            icon: Receipt,
            href: '/expenses',
            title: 'Expenses',
            desc: 'File, approve and reimburse out-of-pocket expenses online.',
            features: [
              'Choose a category (Transport / Travel / Meals / Supplies / Other)',
              'Upload an invoice photo or PDF',
              'Once submitted, approved and reimbursed by an authorized reviewer (approval requires MFA)',
              'Track progress and cancel a pending request anytime',
              'Can link an approved business trip; expense approvers can export details to Excel',
            ],
            access: 'Apply: all staff　Approve & reimburse: staff with expense-approval permission',
          },
          {
            icon: DollarSign,
            href: '/payroll',
            title: 'Payroll',
            desc: 'View personal payslips and annual salary reports.',
            features: [
              'Monthly payslip: base salary, overtime pay, bonuses, deductions',
              'Annual salary summary report',
              'Status: Draft → HR review → Finance confirm → COO approve → Paid',
            ],
            access: 'View: own payroll　View all: HR / Finance / management (view_payroll)　Confirm/approve: confirm/approve_payroll holders / Admin',
          },
          {
            icon: GraduationCap,
            href: '/training',
            title: 'Training',
            desc: 'Assign training courses and manage personal certificate expiry.',
            features: [
              'Create and assign courses (with material links and required flags)',
              'Staff mark completion and upload a certificate',
              'Annual cumulative hours and completion-progress overview',
              'Certificate registry with expiry tracking ("Expiring soon" within 30 days)',
              'Manager "Expiry reminders" tab lists certificates due within 60 days',
            ],
            access: 'View / complete: all staff　Course & certificate management: staff with training-management permission',
          },
          {
            icon: Target,
            href: '/performance',
            title: 'Performance',
            desc: 'A full performance-review cycle, from goal-setting to manager review.',
            features: [
              'HR creates review cycles',
              'Staff set goals (weights totaling 100%) → manager confirms or returns',
              'Staff self-assess each goal (1–5)',
              'Manager scores each goal plus an overall review (MFA required) → completion locks the result',
              'On completion, a KPI snapshot for the period is auto-saved to daily reports (target vs. actual)',
              'HR can view company-wide progress and reopen a completed review',
            ],
            access: 'Goals / self-assessment: self　Review: manager　Cycle management: HR',
          },
        ],
      },
      {
        name: 'Document Management (DMS)',
        modules: [
          {
            icon: FileText,
            href: '/documents',
            title: 'Documents',
            desc: 'Centralized document management with approval workflows, AI translation and OCR full-text search.',
            features: [
              'Upload documents (PDF, Word, images, etc.)',
              'Categories: ANN / REG / NDA / MOU / CONTRACT / AMEND / INTERNAL',
              'Approval flow: Upload → Pending → Approved / Rejected → Archived',
              'AI Translation: generate multilingual versions with one click',
              'Read confirmation: track who has read important documents',
              'OCR full-text search: extract text from scanned PDFs / images with one click to make them searchable; AI policy Q&A answers via semantic retrieval and cites its sources',
            ],
            access: 'Upload: all staff　Approve: document approvers (approve_contract) / Admin (MFA required)',
          },
          {
            icon: Megaphone,
            href: '/announcements',
            title: 'Announcements',
            desc: 'View company announcements and important notices.',
            features: [
              'Filter by category (Urgent / Admin / Regulation / HR)',
              'Important announcements require "Confirm Read"',
              'Unconfirmed announcements appear as reminders on the dashboard',
              'Publishers can nudge unconfirmed staff via Teams with one tap (with a cooldown)',
              'Read-confirmation lists can be exported to Excel; reminder frequency follows each announcement\'s setting',
            ],
            access: 'View: all staff　Publish: HR / Admin',
          },
          {
            icon: FileSignature,
            href: '/contracts',
            title: 'Contracts',
            desc: 'View and manage company contracts.',
            features: [
              'Types: NDA / MOU / Contract / Amendment',
              'Approval flow: Pending → Approved / Rejected (approval requires MFA)',
              'Auto expiry reminders: 90 and 30 days before expiry, via Teams to staff with approval permission',
              'On approval or rejection, the applicant is notified; contracts also notify the COO',
              'Filter by company, status, and type',
            ],
            access: 'View / Approve: Admin or contract approvers (approve_contract, e.g. COO); approval requires MFA',
          },
        ],
      },
      {
        name: 'Projects',
        modules: [
          {
            icon: FolderKanban,
            href: '/projects',
            title: 'Projects',
            desc: 'Create and manage projects, track member overtime.',
            features: [
              'Create projects and assign a lead',
              'Add / manage project members',
              'View project-related overtime requests',
              'Auto-notify the COO when project overtime exceeds a threshold',
              'Status: Active / Closed',
            ],
            access: 'Create: all staff　Member management: Lead / Admin',
          },
        ],
      },
      {
        name: 'Procurement',
        modules: [
          {
            icon: ShoppingCart,
            href: '/procurement',
            title: 'Procurement',
            desc: 'A complete procurement chain from requisition to payment, with supplier, product and inventory management.',
            features: [
              'Document chain: Quote → Purchase Requisition → Goods Receipt → Stock In / Out → Payment',
              'Multi-stage approval engine (Dept. Manager / COO / CEO / Accounting); approval requires MFA',
              'Supplier / product master data and supplier / product evaluations',
              'Batch-lot inventory and ledger, with near-expiry (within 60 days) alerts',
              'Barcode scanning (scanner / phone camera) auto-adjusts stock on in/out',
              'Approved goods receipts convert to assets in one click; voiding approved documents is restricted to managers and requires MFA',
            ],
            access: 'View: staff with procurement permission　Approval: corresponding approval roles (procurement unit / management / payment approval)',
          },
        ],
      },
      {
        name: 'Assets',
        modules: [
          {
            icon: Package,
            href: '/assets',
            title: 'Assets',
            desc: 'Asset register with loan, maintenance and inventory records.',
            features: [
              'Asset register (IT equipment / lab instruments / furniture)',
              'Check-out / return (custodian updated automatically)',
              'Maintenance / calibration / repair records (with attachments); the next due date is auto-scheduled on completion',
              '"Expiry reminders" tab lists items due within 60 days',
              'Can convert an approved procurement goods receipt into an asset in one click',
            ],
            access: 'View: all staff (read-only)　Changes: staff with asset-management permission',
          },
          {
            icon: FlaskConical,
            href: '/lab',
            title: 'Lab Supplies',
            desc: 'Batch-lot, expiry and usage management for reagents and consumables.',
            features: [
              'Reagent and consumable items with batch management (lot number + expiry)',
              'Usage / opening / disposal records (stock deduction is an atomic transaction)',
              'Low-stock and expiry reminders',
              'All staff can view stock',
            ],
            access: 'View: all staff　Changes: staff with lab-supplies-management permission',
          },
        ],
      },
      {
        name: 'Other',
        modules: [
          {
            icon: MessageSquarePlus,
            href: '/feedback/new',
            title: 'Feedback',
            desc: 'Submit anonymous suggestions or feedback to the company.',
            features: [
              'Choose a category (Work Environment, Compensation, Management, Other)',
              'Add detailed comments',
              'Submissions are anonymous — only Admin can view responses',
            ],
          },
          {
            icon: Settings,
            href: '/settings',
            title: 'Settings',
            desc: 'Manage your personal preferences.',
            features: [
              'Switch interface language (繁中 / English / 日本語)',
              'Toggle dark / light mode',
              'Manage Two-Factor Authentication (MFA)',
            ],
          },
        ],
      },
    ],
    matrixTitle: 'Feature Access Matrix',
    matrixSubtitle: 'Access permissions by role',
    matrixLegend: '✓ Allowed　— Not allowed　△ Requires specific permission',
    matrixRoles: { employee: 'Employee', manager: 'Manager', hr: 'HR', admin: 'Admin' },
    matrixSections: [
      {
        name: 'Approvals / Calendar',
        rows: [
          { feature: 'Approvals (approve / reject)', employee: false, manager: true, hr: true, admin: true },
          { feature: 'View calendar', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Manage company events', employee: false, manager: false, hr: true, admin: true },
          { feature: 'Insights dashboard', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: 'Attendance',
        rows: [
          { feature: 'Clock in / out', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Apply missed clock', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Approve missed clock', employee: false, manager: true, hr: true, admin: true },
          { feature: 'View all staff attendance', employee: false, manager: false, hr: true, admin: true },
        ],
      },
      {
        name: 'Leave / Overtime',
        rows: [
          { feature: 'Apply leave', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Approve leave', employee: false, manager: true, hr: true, admin: true },
          { feature: 'Apply overtime', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Approve overtime', employee: false, manager: true, hr: true, admin: true },
        ],
      },
      {
        name: 'Business Trips',
        rows: [
          { feature: 'Apply for a trip', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Approve a trip', employee: false, manager: true, hr: true, admin: true },
        ],
      },
      {
        name: 'Expenses',
        rows: [
          { feature: 'File an expense', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Approve / reimburse', employee: false, manager: '△', hr: '△', admin: '△', note: 'Requires expense_approve permission' },
        ],
      },
      {
        name: 'Payroll',
        rows: [
          { feature: 'View own payroll', employee: true, manager: true, hr: true, admin: true },
          { feature: 'View all payroll', employee: false, manager: false, hr: true, admin: true, note: 'Requires view_payroll permission' },
          { feature: 'Confirm / approve payroll', employee: false, manager: false, hr: false, admin: '△', note: 'Requires confirm/approve_payroll permission' },
        ],
      },
      {
        name: 'Training / Performance',
        rows: [
          { feature: 'View / complete training', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Course & certificate management', employee: false, manager: '△', hr: '△', admin: '△', note: 'Requires training_manage permission' },
          { feature: 'Performance goals & self-assessment', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Performance review / cycle management', employee: false, manager: '△', hr: true, admin: true, note: 'Manager reviews / HR manages cycles' },
        ],
      },
      {
        name: 'Daily Report',
        rows: [
          { feature: 'File a daily report', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Report on my tasks', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Team overview', employee: false, manager: '△', hr: false, admin: true, note: 'Group leads can view' },
          { feature: 'Manage report groups', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: 'Documents',
        rows: [
          { feature: 'Upload documents', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Approve documents', employee: false, manager: false, hr: '△', admin: true, note: 'Requires approve_contract permission' },
          { feature: 'OCR text extraction', employee: false, manager: false, hr: '△', admin: true, note: 'Document manager' },
        ],
      },
      {
        name: 'Announcements / Contracts',
        rows: [
          { feature: 'View announcements', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Publish announcements', employee: false, manager: false, hr: '△', admin: true, note: 'Requires publish_announcement permission' },
          { feature: 'View contracts', employee: false, manager: '△', hr: '△', admin: true, note: 'Requires approve_contract permission' },
          { feature: 'Approve contracts', employee: false, manager: false, hr: false, admin: '△', note: 'Requires approve_contract permission' },
        ],
      },
      {
        name: 'Procurement',
        rows: [
          { feature: 'Procurement work / create documents', employee: false, manager: '△', hr: false, admin: '△', note: 'Requires procurement-unit permission' },
          { feature: 'Procurement approval', employee: false, manager: '△', hr: false, admin: '△', note: 'Per approval role' },
          { feature: 'Payment approval', employee: false, manager: false, hr: false, admin: '△', note: 'Requires payment-approval permission' },
          { feature: 'Void an approved document', employee: false, manager: false, hr: false, admin: '△', note: 'Requires procurement-management permission + MFA' },
        ],
      },
      {
        name: 'Assets / Lab Supplies',
        rows: [
          { feature: 'View assets / stock', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Manage asset changes', employee: false, manager: '△', hr: '△', admin: '△', note: 'Requires asset_manage permission' },
          { feature: 'Lab-supply changes', employee: false, manager: '△', hr: '△', admin: '△', note: 'Requires lab-supplies-management permission' },
        ],
      },
      {
        name: 'Projects / Other',
        rows: [
          { feature: 'Create projects', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Manage project members', employee: false, manager: '△', hr: '△', admin: true, note: 'Project lead can manage' },
          { feature: 'Submit feedback (anonymous)', employee: true, manager: true, hr: true, admin: true },
          { feature: 'View feedback', employee: false, manager: false, hr: false, admin: true },
          { feature: 'Admin panel', employee: false, manager: false, hr: false, admin: true },
        ],
      },
    ],
  },

  'ja': {
    title: 'ヘルプ',
    subtitle: 'myOPSの各機能の使い方を確認できます',
    categories: [
      {
        name: '一般',
        modules: [
          {
            icon: LayoutDashboard,
            href: '/',
            title: 'ダッシュボード',
            desc: 'ログイン後のホーム画面。今日の業務状況を一目で確認できます。',
            features: [
              '未読のお知らせ件数',
              '承認待ちの休暇・残業・経費精算などの申請リマインダー',
              '本日の出勤打刻状況',
              'クイックアクション：打刻、休暇申請、残業申請',
              '証明書・校正/保守の期限接近カード（該当する管理権限がある場合）',
            ],
          },
          {
            icon: CheckSquare,
            href: '/approvals',
            title: '承認センター',
            desc: '承認待ちの申請を一箇所に集約。ページを巡らずに承認・却下できます。',
            features: [
              '集約対象：休暇、残業、打刻漏れ、経費精算、文書 / 契約、給与、購買、出張',
              'ワンタップで承認 / 却下（却下は理由入力が必要）',
              '申請者・種別・日付・金額を表示',
              '金額を伴う書類や重要操作はMFA認証が必要',
              '管理者のポリシーに応じてTeamsカードから直接承認も可能',
            ],
            access: '承認：各申請種別の承認権限に準拠',
          },
          {
            icon: CalendarRange,
            href: '/calendar',
            title: 'カレンダー',
            desc: '会社イベント・承認済み休暇・出張を1ページの月間カレンダーに集約。',
            features: [
              '会社イベント（緑）、承認済み休暇（青）、承認済み出張（紫）',
              '日付をクリックしてその日の全リストを表示',
              '一般従業員の休暇は同部門のみ・必要情報（氏名・日付・休暇種別）のみ表示',
              'HR / 管理者は会社イベントを作成・管理可能',
              '休暇 / 出張の承認後、本人のOutlookに終日「不在」予定を自動作成（片方向同期・初回は再ログインでの認可が必要）',
            ],
            access: '閲覧：全従業員　イベント管理：HR / 管理者',
          },
          {
            icon: BarChart3,
            href: '/insights',
            title: '経営ダッシュボード',
            desc: '全社の運営指標を集約・分析（管理者限定）。',
            features: [
              '当月の出勤・残業サマリー、年間の休暇・経費合計',
              '直近6ヶ月の残業時間・出勤延べ人数・購買金額の推移',
              '休暇種別 / 経費カテゴリ / プロジェクト残業の分布グラフ',
              '統計は台北タイムゾーンで算出',
            ],
            access: '管理者限定',
          },
        ],
      },
      {
        name: '日報',
        modules: [
          {
            icon: ClipboardList,
            href: '/daily-report',
            title: '日報入力',
            desc: 'myOPS上で日々の行程・完了報告・KPIを直接入力できます。',
            features: [
              '行程 / 完了報告 / KPI の3つのタブ',
              'よく使うテンプレートをワンタップで適用',
              '「今日」は台北時間で計算。時差があっても日付がずれない',
              'KPIの空欄を誤って0として保存しない',
            ],
          },
          {
            icon: ListChecks,
            href: '/daily-report/tasks',
            title: 'タスク',
            desc: '上司から割り当てられたタスクとサブタスクを確認・報告します。',
            features: [
              '上司が割り当てたタスク・サブタスクを確認',
              'サブタスクを個別にチェックして保存',
              '完了後にそのまま報告としてマーク',
            ],
          },
          {
            icon: UsersRound,
            href: '/daily-report/team',
            title: 'チーム概要',
            desc: '上司が所属グループメンバーの当日の日報を確認します。',
            features: [
              'グループ責任者（Viewer）がグループ全員の当日の日報を閲覧',
              'グループ単位で集約',
              'グループは管理者が「報告グループ管理」で作成・割当',
            ],
            access: '閲覧：グループ責任者 / 管理者',
          },
        ],
      },
      {
        name: '人事管理',
        modules: [
          {
            icon: Clock,
            href: '/attendance',
            title: '出退勤',
            desc: '出退勤の打刻と勤怠記録の管理。',
            features: [
              'ワンタップで出勤 / 退勤打刻',
              '今月の打刻記録と労働時間の確認',
              '打刻漏れ申請（理由入力必須。上司承認後にその日の記録へ反映）',
              'フレックスシフト：遅刻は当日のシフト開始時刻で判定（未割当は既定の開始時刻）',
              'GPSジオフェンス：管理者が範囲チェックの強制を有効にすると、許可オフィス範囲外では打刻不可（既定はオフ・座標記録のみ）',
            ],
            access: '打刻：全従業員　全員の勤怠確認：HR / 管理者',
          },
          {
            icon: CalendarDays,
            href: '/leave',
            title: '休暇',
            desc: '各種休暇の申請、残日数の確認、取得記録の管理。',
            features: [
              '複数の休暇種別（年次・病気・私用・特別休暇など）',
              '利用可能残日数の確認',
              '個人・チームの休暇カレンダービュー',
              '承認フロー：申請 → 上司承認 / 却下（理由入力必須）',
              '承認済み休暇のキャンセル申請が可能',
              '承認後、Outlookに終日「不在」予定を自動作成（初回は再ログインでの認可が必要）',
            ],
            access: '申請：全従業員　承認：上司 / HR / 管理者',
          },
          {
            icon: Timer,
            href: '/overtime',
            title: '残業',
            desc: '残業時間の申請。残業代は労働基準法に基づき段階計算されます。',
            features: [
              '日付・時間帯（開始〜終了）・説明を入力',
              '残業日区分（勤務日 / 休息日 / 法定休日）は日付から自動判定（土日＝休息日）、法定休日は手動選択可',
              '特定のプロジェクトに紐付け可能',
              '承認フロー：申請 → 上司 → HR → 承認',
              '承認済み残業は労働基準法§24/§39に基づき段階計算（勤務日 / 休息日 / 法定休日で倍率が異なる）され、給与に反映',
            ],
            access: '申請：全従業員　承認：上司 / HR / 管理者',
          },
          {
            icon: Plane,
            href: '/business-trips',
            title: '出張管理',
            desc: '出張申請と行程管理。承認後にOutlookへ同期します。',
            features: [
              '目的地・事由・行程を入力 → 上司承認',
              '申請者は承認待ちの申請をキャンセル可能',
              '承認センターに統合され、ワンタップで承認 / 却下',
              '承認済み出張は経費精算フォームに引き継ぎ可能（カテゴリと事由を自動入力）',
              '承認後、Outlookに終日「不在」予定を自動作成（初回は再ログインでの認可が必要）',
            ],
            access: '申請：全従業員　承認：上司 / HR / 管理者',
          },
          {
            icon: Receipt,
            href: '/expenses',
            title: '経費精算',
            desc: '立替経費の申請・承認・支払をオンラインで。',
            features: [
              'カテゴリ選択（交通 / 出張 / 食事 / 用品 / その他）',
              '領収書の写真またはPDFをアップロード',
              '申請後、承認権限者が承認・支払（承認はMFAが必要）',
              '進捗確認や承認待ち申請のキャンセルがいつでも可能',
              '承認済み出張と紐付け可能。経費承認権限者はExcelに明細を出力可能',
            ],
            access: '申請：全従業員　承認・支払：経費承認権限を持つ従業員',
          },
          {
            icon: DollarSign,
            href: '/payroll',
            title: '給与',
            desc: '個人の給与明細と年間給与レポートの確認。',
            features: [
              '月次給与明細：基本給・残業代・賞与・控除',
              '年間給与サマリーレポート',
              'ステータス：下書き → HR確認 → 財務確認 → COO承認 → 支払済み',
            ],
            access: '閲覧：本人　全員閲覧：HR / 財務 / 経営層（view_payroll）　確認・承認：confirm/approve_payroll 権限者 / Admin',
          },
          {
            icon: GraduationCap,
            href: '/training',
            title: '教育訓練',
            desc: '研修コースの割当と個人の証明書期限管理。',
            features: [
              'コースの作成・割当（教材リンク・必須マーク付き）',
              '従業員が完了をマークし修了証をアップロード',
              '年間累計時間の集計と完了進捗の概要',
              '証明書の登録と期限追跡（30日以内は「まもなく期限」表示）',
              '管理者の「期限リマインダー」タブに60日以内の証明書を一覧',
            ],
            access: '閲覧 / 完了：全従業員　コース・証明書管理：研修管理権限を持つ従業員',
          },
          {
            icon: Target,
            href: '/performance',
            title: '人事考課',
            desc: '目標設定から上司評価まで、一連の人事考課サイクル。',
            features: [
              'HRが考課サイクルを作成',
              '従業員が目標を設定（ウェイト合計100%）→ 上司が承認または差戻し',
              '従業員が目標ごとに自己評価（1〜5点）',
              '上司が目標ごとに採点し総評（MFAが必要）→ 完了で結果をロック',
              '完了時、その期間の日報KPIスナップショット（目標 vs 実績）を自動保存',
              'HRは全社の進捗を確認し、完了済み考課を再開可能',
            ],
            access: '目標 / 自己評価：本人　評価：上司　サイクル管理：HR',
          },
        ],
      },
      {
        name: '文書管理（DMS）',
        modules: [
          {
            icon: FileText,
            href: '/documents',
            title: 'ドキュメント',
            desc: '会社の各種文書を一元管理。承認フロー・AI翻訳・OCR全文検索をサポート。',
            features: [
              '文書のアップロード（PDF・Word・画像など）',
              '種別：ANN / REG / NDA / MOU / CONTRACT / AMEND / INTERNAL',
              '承認フロー：アップロード → 承認待ち → 承認 / 却下 → アーカイブ',
              'AI翻訳：ワンクリックで多言語版を生成',
              '閲覧確認：重要文書の既読追跡',
              'OCR全文検索：スキャンPDF / 画像からワンクリックでテキスト抽出して検索可能に。AI政策Q&Aは意味検索で回答し、出典を引用',
            ],
            access: 'アップロード：全従業員　承認：文書承認権限者（approve_contract）/ Admin（MFA必須）',
          },
          {
            icon: Megaphone,
            href: '/announcements',
            title: 'お知らせ',
            desc: '会社からのお知らせや重要通知を確認できます。',
            features: [
              'カテゴリ別フィルター（緊急 / 管理 / 規程 / HR）',
              '重要なお知らせは「確認済み」クリックが必要',
              '未確認のお知らせはダッシュボードにリマインダー表示',
              '投稿者は未確認の同僚へTeamsでワンタップ催促（重複防止のクールダウン付き）',
              '閲覧確認リストはExcelに出力可能。リマインダー頻度は各お知らせの設定に従う',
            ],
            access: '閲覧：全従業員　投稿：HR / Admin',
          },
          {
            icon: FileSignature,
            href: '/contracts',
            title: '契約',
            desc: '会社の契約書を確認・管理します。',
            features: [
              '種別：NDA / MOU / 契約 / 契約修正',
              '承認フロー：承認待ち → 承認 / 却下（承認はMFAが必要）',
              '期限自動リマインド：期限の90日前と30日前にTeamsで承認権限者へ通知',
              '承認・却下後に申請者へ通知。契約類は営業責任者（COO）にも通知',
              '会社・ステータス・種別でフィルタリング',
            ],
            access: '閲覧 / 承認：Admin または契約承認権限者（approve_contract、COO等）；承認はMFA必須',
          },
        ],
      },
      {
        name: 'プロジェクト',
        modules: [
          {
            icon: FolderKanban,
            href: '/projects',
            title: 'プロジェクト',
            desc: 'プロジェクトの作成・管理と残業状況の追跡。',
            features: [
              'プロジェクト作成とリーダーの指定',
              'メンバーの追加 / 管理',
              'プロジェクト関連の残業申請を確認',
              'プロジェクト残業が閾値を超えると営業責任者（COO）へ自動通知',
              'ステータス：進行中 / 終了',
            ],
            access: '作成：全従業員　メンバー管理：リーダー / Admin',
          },
        ],
      },
      {
        name: '購買',
        modules: [
          {
            icon: ShoppingCart,
            href: '/procurement',
            title: '購買',
            desc: '購買申請から支払までの一連のフローと、仕入先・商品・在庫の管理。',
            features: [
              '書類チェーン：見積 → 購買申請 → 入荷検収 → 入庫 / 出庫 → 請求',
              '多段階承認エンジン（部門長 / COO / CEO / 経理）。承認はMFAが必要',
              '仕入先 / 商品マスタと仕入先 / 商品の評価',
              'ロット在庫と元帳、期限接近（60日以内）の警告',
              'バーコードスキャン（スキャナー / スマホカメラ）で入出庫時に数量を自動増減',
              '承認済み入荷検収はワンクリックで資産化。承認済み書類の取消は管理者限定かつMFAが必要',
            ],
            access: '閲覧：購買権限を持つ従業員　承認：対応する承認ロール（購買作業 / 管理 / 請求承認）',
          },
        ],
      },
      {
        name: '資産管理',
        modules: [
          {
            icon: Package,
            href: '/assets',
            title: '資産管理',
            desc: '資産台帳と貸出・保守・棚卸の記録。',
            features: [
              '資産台帳（IT機器 / 実験機器 / 什器）',
              '貸出 / 返却（保管者を自動更新）',
              '保守 / 校正 / 修理の記録（添付付き）。完了時に次回期限を自動設定',
              '「期限リマインダー」タブに60日以内の対象を一覧',
              '購買の承認済み入荷検収からワンクリックで資産へ登録可能',
            ],
            access: '閲覧：全従業員（読み取り専用）　変更：資産管理権限を持つ従業員',
          },
          {
            icon: FlaskConical,
            href: '/lab',
            title: '試薬・消耗品',
            desc: '試薬・消耗品のロット・期限・使用の管理。',
            features: [
              '試薬・消耗品の品目とロット管理（ロット番号＋有効期限）',
              '使用 / 開封 / 廃棄の記録（在庫の引き落としは原子的トランザクション）',
              '低在庫・期限接近のリマインダー',
              '全従業員が在庫を閲覧可能',
            ],
            access: '閲覧：全従業員　変更：試薬・消耗品管理権限を持つ従業員',
          },
        ],
      },
      {
        name: 'その他',
        modules: [
          {
            icon: MessageSquarePlus,
            href: '/feedback/new',
            title: 'フィードバック',
            desc: '会社への提案や意見を匿名で送ることができます。',
            features: [
              'カテゴリ選択（職場環境・給与福利厚生・管理制度・その他）',
              '詳細コメントの入力',
              '送信後は匿名。Adminのみ閲覧可能',
            ],
          },
          {
            icon: Settings,
            href: '/settings',
            title: '設定',
            desc: '個人の設定を管理します。',
            features: [
              '言語切り替え（繁体中文 / English / 日本語）',
              'ダーク / ライトモードの切り替え',
              '二要素認証（MFA）の管理',
            ],
          },
        ],
      },
    ],
    matrixTitle: '機能アクセスマトリックス',
    matrixSubtitle: '役割別の機能アクセス権限',
    matrixLegend: '✓ 利用可　— 利用不可　△ 特定の権限が必要',
    matrixRoles: { employee: '一般', manager: '上司', hr: 'HR', admin: 'Admin' },
    matrixSections: [
      {
        name: '承認 / カレンダー',
        rows: [
          { feature: '承認センター（承認 / 却下）', employee: false, manager: true, hr: true, admin: true },
          { feature: 'カレンダー閲覧', employee: true, manager: true, hr: true, admin: true },
          { feature: '会社イベント管理', employee: false, manager: false, hr: true, admin: true },
          { feature: '経営ダッシュボード', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: '勤怠管理',
        rows: [
          { feature: '出退勤打刻', employee: true, manager: true, hr: true, admin: true },
          { feature: '打刻漏れ申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '打刻漏れ承認', employee: false, manager: true, hr: true, admin: true },
          { feature: '全従業員の勤怠確認', employee: false, manager: false, hr: true, admin: true },
        ],
      },
      {
        name: '休暇 / 残業',
        rows: [
          { feature: '休暇申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '休暇承認', employee: false, manager: true, hr: true, admin: true },
          { feature: '残業申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '残業承認', employee: false, manager: true, hr: true, admin: true },
        ],
      },
      {
        name: '出張',
        rows: [
          { feature: '出張申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '出張承認', employee: false, manager: true, hr: true, admin: true },
        ],
      },
      {
        name: '経費精算',
        rows: [
          { feature: '経費申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '承認 / 支払', employee: false, manager: '△', hr: '△', admin: '△', note: 'expense_approve 権限が必要' },
        ],
      },
      {
        name: '給与',
        rows: [
          { feature: '本人の給与確認', employee: true, manager: true, hr: true, admin: true },
          { feature: '全従業員の給与確認', employee: false, manager: false, hr: true, admin: true, note: 'view_payroll 権限が必要' },
          { feature: '給与確認 / 承認', employee: false, manager: false, hr: false, admin: '△', note: 'confirm/approve_payroll 権限が必要' },
        ],
      },
      {
        name: '教育訓練 / 人事考課',
        rows: [
          { feature: '研修の閲覧 / 完了', employee: true, manager: true, hr: true, admin: true },
          { feature: 'コース・証明書管理', employee: false, manager: '△', hr: '△', admin: '△', note: 'training_manage 権限が必要' },
          { feature: '考課の目標・自己評価', employee: true, manager: true, hr: true, admin: true },
          { feature: '考課評価 / サイクル管理', employee: false, manager: '△', hr: true, admin: true, note: '上司が評価 / HRがサイクル管理' },
        ],
      },
      {
        name: '日報',
        rows: [
          { feature: '日報の入力', employee: true, manager: true, hr: true, admin: true },
          { feature: '自分のタスク報告', employee: true, manager: true, hr: true, admin: true },
          { feature: 'チーム概要', employee: false, manager: '△', hr: false, admin: true, note: 'グループ責任者が閲覧可' },
          { feature: '報告グループ管理', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: '文書管理',
        rows: [
          { feature: '文書アップロード', employee: true, manager: true, hr: true, admin: true },
          { feature: '文書承認', employee: false, manager: false, hr: '△', admin: true, note: 'approve_contract 権限が必要' },
          { feature: 'OCRテキスト抽出', employee: false, manager: false, hr: '△', admin: true, note: '文書管理者' },
        ],
      },
      {
        name: 'お知らせ / 契約',
        rows: [
          { feature: 'お知らせ閲覧', employee: true, manager: true, hr: true, admin: true },
          { feature: 'お知らせ投稿', employee: false, manager: false, hr: '△', admin: true, note: 'publish_announcement 権限が必要' },
          { feature: '契約閲覧', employee: false, manager: '△', hr: '△', admin: true, note: 'approve_contract 権限が必要' },
          { feature: '契約承認', employee: false, manager: false, hr: false, admin: '△', note: 'approve_contract 権限が必要' },
        ],
      },
      {
        name: '購買',
        rows: [
          { feature: '購買作業 / 書類作成', employee: false, manager: '△', hr: false, admin: '△', note: '購買作業権限が必要' },
          { feature: '購買承認', employee: false, manager: '△', hr: false, admin: '△', note: '承認ロールに準拠' },
          { feature: '請求承認', employee: false, manager: false, hr: false, admin: '△', note: '請求承認権限が必要' },
          { feature: '承認済み書類の取消', employee: false, manager: false, hr: false, admin: '△', note: '購買管理権限 + MFA が必要' },
        ],
      },
      {
        name: '資産 / 試薬・消耗品',
        rows: [
          { feature: '資産 / 在庫の閲覧', employee: true, manager: true, hr: true, admin: true },
          { feature: '資産の変更管理', employee: false, manager: '△', hr: '△', admin: '△', note: 'asset_manage 権限が必要' },
          { feature: '試薬・消耗品の変更', employee: false, manager: '△', hr: '△', admin: '△', note: '試薬・消耗品管理権限が必要' },
        ],
      },
      {
        name: 'プロジェクト / その他',
        rows: [
          { feature: 'プロジェクト作成', employee: true, manager: true, hr: true, admin: true },
          { feature: 'メンバー管理', employee: false, manager: '△', hr: '△', admin: true, note: 'プロジェクトリーダーも可' },
          { feature: 'フィードバック送信（匿名）', employee: true, manager: true, hr: true, admin: true },
          { feature: 'フィードバック閲覧', employee: false, manager: false, hr: false, admin: true },
          { feature: '管理者パネル', employee: false, manager: false, hr: false, admin: true },
        ],
      },
    ],
  },
}

export default function HelpPage() {
  const locale = useLocale()
  const content = CONTENT[locale] ?? CONTENT['zh-TW']

  return (
    <div className="max-w-3xl mx-auto pb-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-[Lexend]">
          {content.title}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{content.subtitle}</p>
      </div>

      {/* AI 政策問答（flag ask_ai 開啟時；403 自動隱藏） */}
      <div className="mb-8">
        <AskAiBox />
      </div>

      {/* Feature Matrix */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={16} className="text-blue-500" aria-hidden />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{content.matrixTitle}</h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{content.matrixSubtitle}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{content.matrixLegend}</p>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 w-48"></th>
                  {(['employee', 'manager', 'hr', 'admin'] as const).map(r => (
                    <th key={r} className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {content.matrixRoles[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {content.matrixSections.map((section) => (
                  <>
                    <tr key={section.name} className="bg-slate-50/60 dark:bg-slate-800/60">
                      <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {section.name}
                      </td>
                    </tr>
                    {section.rows.map((row, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                          <span>{row.feature}</span>
                          {row.note && <span className="ml-1.5 text-xs text-slate-400">({row.note})</span>}
                        </td>
                        {([row.employee, row.manager, row.hr, row.admin] as (boolean | string)[]).map((val, j) => (
                          <td key={j} className="px-3 py-2.5 text-center">
                            {val === true
                              ? <span className="text-green-500 font-bold">✓</span>
                              : val === false
                              ? <span className="text-slate-300 dark:text-slate-600">—</span>
                              : <span className="text-amber-500 font-medium">△</span>
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Categories */}
      <div className="space-y-8">
        {content.categories.map((cat) => (
          <section key={cat.name}>
            <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-1">
              {cat.name}
            </h2>
            <div className="space-y-3">
              {cat.modules.map((mod) => {
                const Icon = mod.icon
                return (
                  <div
                    key={mod.href}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Icon size={18} aria-hidden />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-800 dark:text-slate-200">{mod.title}</h3>
                          <Link
                            href={mod.href}
                            className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            aria-label={mod.title}
                          >
                            <ExternalLink size={13} />
                          </Link>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{mod.desc}</p>
                        <ul className="mt-3 space-y-1.5">
                          {mod.features.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                              <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                        {mod.access && (
                          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-700/50 px-3 py-1.5 rounded-lg">
                            🔐 {mod.access}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
