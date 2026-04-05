'use client'

import { useLocale } from 'next-intl'
import Link from 'next/link'
import {
  LayoutDashboard, Clock, CalendarDays, Timer, DollarSign,
  FolderKanban, FileText, Megaphone, FileSignature,
  MessageSquarePlus, Settings, ExternalLink,
} from 'lucide-react'

type Module = {
  icon: React.ElementType
  href: string
  title: string
  desc: string
  features: string[]
  access?: string
}

type Category = { name: string; modules: Module[] }
type PageContent = { title: string; subtitle: string; categories: Category[] }

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
            title: '儀表板',
            desc: '登入後的首頁，提供今日工作狀況的快速概覽。',
            features: [
              '顯示未讀公告數量',
              '待審請假、加班申請件數提醒',
              '今日打卡狀態',
              '快速入口：打卡、請假、加班申請',
            ],
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
            desc: '集中管理公司各類文件，支援審核流程與 AI 翻譯。',
            features: [
              '上傳文件（支援 PDF、Word、圖片等格式）',
              '依類型分類：ANN / REG / NDA / MOU / CONTRACT / AMEND / INTERNAL',
              '審核流程：上傳 → 待審 → 核准 / 退回 → 封存',
              'AI 翻譯：一鍵生成多語版本',
              '確認閱讀：追蹤重要文件的閱讀狀態',
            ],
            access: '上傳：所有員工　核准：主管 / HR / Admin',
          },
          {
            icon: Megaphone,
            href: '/announcements',
            title: '公告',
            desc: '查看公司公告與重要通知。',
            features: [
              '依類別標籤篩選（緊急 / 一般 / HR / 財務）',
              '重要公告需點擊「確認已讀」',
              '未確認公告會顯示在儀表板提醒',
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
              '審核流程：待審 → 核准 / 退回',
              '到期日提醒（30 天內到期顯示警示）',
              '依公司、狀態、類型篩選',
            ],
            access: '查看：主管 / HR / Admin　核准：財務 / Admin',
          },
        ],
      },
      {
        name: '人事管理（HR）',
        modules: [
          {
            icon: Clock,
            href: '/attendance',
            title: '出勤打卡',
            desc: '上下班打卡及出勤記錄管理。',
            features: [
              '一鍵上班打卡 / 下班打卡',
              '查看本月打卡記錄與工時統計',
              '申請補打卡（需填寫原因）',
              'Admin 可查看全員出勤狀況',
            ],
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
            ],
            access: '申請：所有員工　審核：主管 / HR / Admin',
          },
          {
            icon: Timer,
            href: '/overtime',
            title: '加班',
            desc: '申請加班時數，關聯至專案進行追蹤。',
            features: [
              '填寫加班日期、時段（起訖時間）與說明',
              '可關聯至指定專案',
              '審核流程：送出 → 主管 → HR → 核准',
              '已核准加班計入薪資計算',
            ],
            access: '申請：所有員工　審核：主管 / HR / Admin',
          },
          {
            icon: DollarSign,
            href: '/payroll',
            title: '薪資',
            desc: '查看個人薪資明細與年度薪資報告。',
            features: [
              '每月薪資明細：底薪、加班費、獎金、扣項',
              '年度薪資彙總報告',
              '薪資狀態：草稿 / 已發薪',
            ],
            access: '查看：本人薪資　Admin 可查看全員',
          },
          {
            icon: FolderKanban,
            href: '/projects',
            title: '專案',
            desc: '建立與管理專案，追蹤成員加班情形。',
            features: [
              '建立專案、指定負責人',
              '新增 / 管理專案成員',
              '查看專案相關加班申請',
              '專案狀態：進行中 / 已結案',
            ],
            access: '建立：所有員工　成員管理：負責人 / Admin',
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
              'Pending leave / overtime approval reminders',
              'Today\'s clock-in status',
              'Quick actions: clock in, apply leave, apply overtime',
            ],
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
            desc: 'Centralized document management with approval workflows and AI translation.',
            features: [
              'Upload documents (PDF, Word, images, etc.)',
              'Categories: ANN / REG / NDA / MOU / CONTRACT / AMEND / INTERNAL',
              'Approval flow: Upload → Pending → Approved / Rejected → Archived',
              'AI Translation: generate multilingual versions with one click',
              'Read confirmation: track who has read important documents',
            ],
            access: 'Upload: all staff　Approve: Manager / HR / Admin',
          },
          {
            icon: Megaphone,
            href: '/announcements',
            title: 'Announcements',
            desc: 'View company announcements and important notices.',
            features: [
              'Filter by category (Urgent / General / HR / Finance)',
              'Important announcements require "Confirm Read"',
              'Unconfirmed announcements appear as reminders on the dashboard',
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
              'Approval flow: Pending → Approved / Rejected',
              'Expiry reminders (warning shown within 30 days)',
              'Filter by company, status, and type',
            ],
            access: 'View: Manager / HR / Admin　Approve: Finance / Admin',
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
              'Apply for missed clock-in/out (with reason)',
              'Admin can view all staff attendance',
            ],
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
            ],
            access: 'Apply: all staff　Approve: Manager / HR / Admin',
          },
          {
            icon: Timer,
            href: '/overtime',
            title: 'Overtime',
            desc: 'Apply for overtime hours linked to projects.',
            features: [
              'Enter date, time range, and description',
              'Link to a specific project',
              'Approval flow: Submit → Manager → HR → Approved',
              'Approved overtime is included in payroll',
            ],
            access: 'Apply: all staff　Approve: Manager / HR / Admin',
          },
          {
            icon: DollarSign,
            href: '/payroll',
            title: 'Payroll',
            desc: 'View personal payslips and annual salary reports.',
            features: [
              'Monthly payslip: base salary, overtime pay, bonuses, deductions',
              'Annual salary summary report',
              'Status: Draft / Paid',
            ],
            access: 'View: own payroll only　Admin can view all staff',
          },
          {
            icon: FolderKanban,
            href: '/projects',
            title: 'Projects',
            desc: 'Create and manage projects, track member overtime.',
            features: [
              'Create projects and assign a lead',
              'Add / manage project members',
              'View project-related overtime requests',
              'Status: Active / Closed',
            ],
            access: 'Create: all staff　Member management: Lead / Admin',
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
              '承認待ての休暇・残業申請のリマインダー',
              '本日の出勤打刻状況',
              'クイックアクション：打刻、休暇申請、残業申請',
            ],
          },
        ],
      },
      {
        name: '文書管理（DMS）',
        modules: [
          {
            icon: FileText,
            href: '/documents',
            title: '文書',
            desc: '会社の各種文書を一元管理。承認フローとAI翻訳をサポートします。',
            features: [
              '文書のアップロード（PDF・Word・画像など）',
              '種別：ANN / REG / NDA / MOU / CONTRACT / AMEND / INTERNAL',
              '承認フロー：アップロード → 承認待ち → 承認 / 却下 → アーカイブ',
              'AI翻訳：ワンクリックで多言語版を生成',
              '閲覧確認：重要文書の既読追跡',
            ],
            access: 'アップロード：全従業員　承認：上司 / HR / Admin',
          },
          {
            icon: Megaphone,
            href: '/announcements',
            title: 'お知らせ',
            desc: '会社からのお知らせや重要通知を確認できます。',
            features: [
              'カテゴリ別フィルター（緊急 / 一般 / HR / 財務）',
              '重要なお知らせは「確認済み」クリックが必要',
              '未確認のお知らせはダッシュボードにリマインダー表示',
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
              '承認フロー：承認待ち → 承認 / 却下',
              '期限切れ警告（30日以内の契約をハイライト表示）',
              '会社・ステータス・種別でフィルタリング',
            ],
            access: '閲覧：上司 / HR / Admin　承認：財務 / Admin',
          },
        ],
      },
      {
        name: '人事管理（HR）',
        modules: [
          {
            icon: Clock,
            href: '/attendance',
            title: '出退勤',
            desc: '出退勤の打刻と勤怠記録の管理。',
            features: [
              'ワンタップで出勤 / 退勤打刻',
              '今月の打刻記録と労働時間の確認',
              '打刻漏れ申請（理由入力が必要）',
              'Adminは全従業員の勤怠を確認可能',
            ],
          },
          {
            icon: CalendarDays,
            href: '/leave',
            title: '休暇',
            desc: '各種休暇の申請、残日数の確認、取得記録の管理。',
            features: [
              '複数の休暇種別（年次・病気・特別休暇など）',
              '利用可能残日数の確認',
              '個人・チームの休暇カレンダービュー',
              '承認フロー：申請 → 上司承認 / 却下（理由入力必須）',
              '承認済み休暇のキャンセル申請が可能',
            ],
            access: '申請：全従業員　承認：上司 / HR / Admin',
          },
          {
            icon: Timer,
            href: '/overtime',
            title: '残業',
            desc: '残業時間の申請とプロジェクトへの紐付け。',
            features: [
              '日付・時間帯（開始〜終了）・説明を入力',
              '特定のプロジェクトに紐付け可能',
              '承認フロー：申請 → 上司 → HR → 承認',
              '承認済み残業は給与計算に反映',
            ],
            access: '申請：全従業員　承認：上司 / HR / Admin',
          },
          {
            icon: DollarSign,
            href: '/payroll',
            title: '給与',
            desc: '個人の給与明細と年間給与レポートの確認。',
            features: [
              '月次給与明細：基本給・残業代・賞与・控除',
              '年間給与サマリーレポート',
              'ステータス：下書き / 支払済み',
            ],
            access: '閲覧：本人のみ　Adminは全従業員を閲覧可能',
          },
          {
            icon: FolderKanban,
            href: '/projects',
            title: 'プロジェクト',
            desc: 'プロジェクトの作成・管理と残業状況の追跡。',
            features: [
              'プロジェクト作成とリーダーの指定',
              'メンバーの追加 / 管理',
              'プロジェクト関連の残業申請を確認',
              'ステータス：進行中 / 終了',
            ],
            access: '作成：全従業員　メンバー管理：リーダー / Admin',
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
