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
  MapPin, Landmark, Gift, Bot, ScrollText, LogOut, UserPlus, Building2,
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
            desc: '集中所有待你審核的申請，一頁核准或退回，不用逐頁巡。核准/退回直接呼叫各模組原本的 API，本頁只是彙總入口，非另一套簽核系統。',
            features: [
              '彙總待審：請假、加班、補打卡、報支、文件 / 合約、薪資、採購、出差',
              '一鍵核准或退回（退回需填原因）',
              '顯示申請人、類型、日期與金額',
              '金額型單據與敏感操作需 MFA 驗證',
              'Teams 一鍵核准僅涵蓋 10 種採購單據（依管理員政策），其餘（請假 / 加班 / 報帳 / 文件合約 / 薪資）Teams 通知一律為純文字，需點連結開網頁走 MFA',
            ],
            access: '審核：依各申請類型的審核權限',
          },
          {
            icon: CalendarRange,
            href: '/calendar',
            title: '公司行事曆',
            desc: '一頁月曆彙總公司活動、已核准請假與出差，可對公司活動 RSVP。',
            features: [
              '公司活動（綠）、同事請假中（藍）、已核准出差（紫，顯示目的地）',
              '點選日期查看當日完整清單；對公司活動 RSVP 參加 / 不參加 / 未定',
              '請假僅顯示「請假中」不顯示假別（自 v0.9.9 起刻意設計，健康個資考量）；需看假別請用「請假行事曆」（同部門 / HR 可見假別，供主管排班）',
              'HR / 管理員可新增 / 編輯 / 刪除公司活動',
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
            desc: '直接在 myOPS 填報每日行程與 KPI；行程項目點圈圈勾選完成，就是完成回報。',
            features: [
              '今日行程 / KPI 兩個分頁（完成回報已併入今日行程的完成勾選）',
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
            desc: '依群組查看成員當日行程與完成進度；群組主管（Viewer）額外可見 KPI 並管理指標。',
            features: [
              '同群組一般成員也可互相查看彼此行程與完成進度（不含 KPI，刻意設計讓成員互相掌握進度）',
              '群組主管（Viewer）額外看到每位成員 KPI 數值',
              '【Viewer / 管理員】KPI 指標管理：新增 / 編輯 / 停用（可復原）/ 永久刪除指標',
              '管理員可切換查看任一群組',
            ],
            access: '查看：同群組成員（不含 KPI）　KPI 與指標管理：群組主管（Viewer）/ 管理員',
          },
          {
            icon: UsersRound,
            href: '/admin/daily-report/groups',
            title: '每日報告群組管理',
            desc: '建立每日報告群組並指派成員與觀看者（主管），是啟用整條每日報告功能的第一步。',
            features: [
              '新增 / 編輯 / 刪除群組（名稱、說明）',
              '加入成員並指定角色：member（填報）或 viewer（觀看者 / 主管）',
              '需先於系統設定開啟「每日報告」功能，再建群組指派成員，成員才會在「每日填報」看到內容',
            ],
            access: '管理員限定',
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
            desc: '上下班打卡及個人紀錄查詢；HR / 管理員在同頁「全員紀錄」分頁查看全公司紀錄並可作廢異常紀錄。舊路由 /admin/attendance 現僅轉址，非獨立頁面。',
            features: [
              '一鍵上班打卡 / 下班打卡（含 GPS；管理員開啟「強制打卡範圍」時需落在圍欄內才能成功）',
              '「我的紀錄」依年 / 月查歷史打卡與工時',
              '申請補打卡（需填原因），核准人由系統自動指定（通常為主管），核准需 MFA',
              '彈性班別：遲到以你當日班別的上班時間判定（未指派者沿用預設）',
              '【HR / 管理員】「全員紀錄」依月 / 員工 / 僱用類型篩選並可作廢異常紀錄（需填原因）/ 取消作廢，皆需 MFA',
            ],
            access: '打卡：所有員工　全員紀錄查看與作廢：HR / 管理員（HR 判定含 job_role，與請假 / 加班 / 出差不同）',
          },
          {
            icon: MapPin,
            href: '/admin/geofences',
            title: '打卡範圍',
            desc: '設定允許打卡的辦公室地理座標範圍（可多個地點），並可開關「強制範圍檢查」。全出勤群組唯一只認 role=admin 的頁面，HR 無論哪種身分皆無法進入。',
            features: [
              '開關「強制打卡範圍檢查」（預設關閉，僅記錄座標不阻擋）',
              '新增圍欄（名稱 / 經緯度或用目前位置 / 半徑）',
              '啟用 / 停用、刪除圍欄；可設多個，打卡落在任一圍欄內即合格',
            ],
            access: '管理員限定（HR / COO 皆不可見）',
          },
          {
            icon: Clock,
            href: '/admin/shifts',
            title: '班別管理',
            desc: '定義多種上下班班別並指派給員工；打卡遲到判定依員工當日所屬班別的上班時間計算。',
            features: [
              '新增 / 編輯班別（名稱、上下班時間、工作日、彈性寬限、休息分鐘數、啟用狀態）',
              '為每位員工指派目前適用班別（僅列啟用中班別）',
            ],
            access: '管理：HR / 管理員（不含 COO，與假別管理 / 假別額度 / 出勤異常不同）',
          },
          {
            icon: BarChart3,
            href: '/admin/attendance-anomalies',
            title: '出勤異常',
            desc: '唯讀報表：近 30 天連續 3 天以上自動補登（忘刷卡）的正職名單，以及本月缺打卡超過 3 次的實習生名單。',
            features: [
              '「正職連續自動補登」名單（天數 ≥ 5 紅色標示）',
              '「實習生缺打卡」名單',
              '純資料呈現，無匯出或標記已處理功能',
            ],
            access: '查看：HR（僅 job_role）/ COO / 管理員（不認個別授權功能）',
          },
          {
            icon: CalendarDays,
            href: '/leave',
            title: '請假',
            desc: '申請各類假別，查看假期餘額與請假紀錄；HR / 管理員可查全員紀錄並代撤已核准的假。',
            features: [
              '支援多種假別（年假、病假、事假、特休等），特休週年制、其餘曆年制',
              '查看可用假期餘額；特殊假別（婚假 / 喪假 / 產假等）須先送「特殊假申請」由 HR 核給天數才能正式申請',
              '審核流程：送出 → 主管 / HR / 管理員核准或退回（需填原因，核准需 MFA）',
              '尚未開始的已核准假可自行撤銷；已開始的假只有 HR / 管理員能代為撤銷',
              '核准後自動於 Outlook 建立整天「不在辦公室」事件，退回 / 撤銷自動移除（首次需重新登入授權）',
            ],
            access: '申請：所有員工　審核：直屬主管 / HR / 管理員　全員紀錄與代撤已核准假：HR / 管理員（本頁 HR 判定不含 job_role，與打卡頁不同）',
          },
          {
            icon: CalendarRange,
            href: '/leave/calendar',
            title: '請假行事曆',
            desc: '以月曆檢視部門或全公司請假分布（含假別與事由），供主管排班協調。目前程式碼中沒有任何連結導向此頁，屬「孤兒頁面」，需直接輸入網址進入。',
            features: [
              '月曆檢視當月各天請假人數（核准 = 綠點、待審 = 黃點）',
              '點某天篩選當天請假清單（姓名 / 假別 / 期間 / 天數 / 狀態）',
              '一般員工僅見同部門；HR / 管理員可用部門下拉切換查看任一部門或全公司',
              '純唯讀，與 /calendar 刻意分工不同：本頁顯示假別（同部門 / HR 排班用途），/calendar 自 v0.9.9 起故意不顯示假別',
            ],
            access: '查看：所有員工（一般員工限同部門）　全公司查看：HR / 管理員',
          },
          {
            icon: CalendarDays,
            href: '/admin/leave-types',
            title: '假別管理',
            desc: '維護公司假別清單（名稱 / 適用對象 / 給薪方式 / 年度上限 / 需提前申請天數 / 啟用狀態），是「請假」頁申請下拉的資料來源。本頁無唯讀模式，COO 也可完全編輯。',
            features: [
              '新增假別（名稱 / 適用對象 / 給薪方式 / 年度上限 / 提前申請天數 / 啟用狀態）',
              '編輯既有假別欄位，存檔後立即生效',
              '是否需 HR 先審核資格目前無對應 UI 控制項，須後端直接設定',
            ],
            access: '管理：HR（僅 job_role）/ COO / 管理員',
          },
          {
            icon: ListChecks,
            href: '/admin/leave-balances',
            title: '假別額度',
            desc: '逐員工、逐假別調整當年度（或特休週年制當期）核給天數，是員工請假頁看到餘額的資料來源。自 v0.9.7 起為側邊欄唯一維護入口，同樣沒有唯讀模式。',
            features: [
              '依員工 / 假別調整當年度核給天數（表格式輸入）',
              '「依年資自動帶入特休」批次產生 / 更新特休額度（不覆蓋已手動調整資料）',
              '用員工下拉篩選單一員工；查看各假別已使用天數',
            ],
            access: '管理：HR（僅 job_role）/ COO / 管理員',
          },
          {
            icon: Timer,
            href: '/overtime',
            title: '加班',
            desc: '申請加班時數，加班費依勞基法分段計算；HR / 管理員可查全員紀錄，但 HR 不能核准加班。',
            features: [
              '填寫加班日期、時段（起訖時間）與說明，日別（工作日 / 休息日 / 國定假日）依日期自動判斷',
              '可關聯至指定專案',
              '「待審核」分頁會顯示全公司待審加班單給任何登入員工看到，但按核准鍵若非直屬主管 / 專案負責人 / 管理員 / 具 coo_notify 授權者一律 403（看得到≠核准得到，非授權外洩）',
              'HR（granted_features 含 hr_manager）完全不能核准加班，僅能查看「全員紀錄」',
              '已核准加班依勞基法 §24/§39 分段計薪（工作日、休息日、國定假日倍率不同），計入薪資草稿，需 MFA',
            ],
            access: '申請：所有員工　審核：直屬主管 / 專案負責人 / 管理員（HR 不能核准加班）　全員紀錄：HR / 管理員',
          },
          {
            icon: Plane,
            href: '/business-trips',
            title: '出差管理',
            desc: '出差申請與行程管理，核准後同步 Outlook。送單時自動指定當時的直屬主管為審批人，之後即使換主管，該單審批人也不會變。',
            features: [
              '填寫目的地、事由、行程 → 送單時的直屬主管審批（需 MFA）',
              '申請人可取消待審核的申請',
              '納入簽核中心一鍵核准 / 退回',
              '已核准出差可一鍵帶入報支表單（類別與事由預填）',
              '核准後自動於 Outlook 建立整天「不在辦公室」事件，退回自動清除（首次需重新登入授權）',
            ],
            access: '申請：所有員工　審核：送單時的直屬主管 / HR / 管理員　全員紀錄：HR / 管理員',
          },
          {
            icon: Receipt,
            href: '/expenses',
            title: '員工報帳',
            desc: '代墊費用線上申請、核准與撥付；自 v0.10.2 起改為會計科目分類。目前僅支援台幣金額。',
            features: [
              '選會計科目類別、填費用日期 / 申請月份、發票號碼、事由與金額（TWD）',
              '上傳發票 / 收據照片或 PDF（可多張）',
              '送出後由具審批權限者核准、退回或標記已撥付（三動作皆需 MFA，且不可審批自己送出的單）',
              '待審核期間可自行取消（狀態改為已取消，非刪除，不需 MFA）',
              '可關聯已核准出差一鍵帶入；具報帳審核權限者可匯出 Excel 明細',
            ],
            access: '申請：所有員工　審批撥付與全員記錄：具報帳審批權限者',
          },
          {
            icon: DollarSign,
            href: '/payroll',
            title: '薪資',
            desc: '一般員工只看「我的薪資單」（僅人資長已核准或已發放狀態）；HR / 財務 / 具檢視權限者多一個「薪資表」分頁可批次計算、手動建立、整批簽核。批次計算需人工按鈕觸發，目前無任何排程自動產生。',
            features: [
              '「我的薪資單」查看近 12 個月已核准 / 已發放薪資單摘要，明細含應發 / 應扣 / 實發 / 雇主負擔與簽核軌跡',
              '【HR / 管理員】批次計算：依月薪 / 已核准加班 / 無薪假扣款 / 獎金 / 勞健保級距表產生當月薪資草稿（重算會覆寫已進入簽核流程的單並清空簽核軌跡，會先警告受影響筆數）',
              '【HR / 管理員】整批簽核：對同一關所有薪資單一次推進下一關，底層仍逐筆檢查 MFA 與狀態機',
              '薪資四關簽核：HR 審核 → 財務確認（需 confirm_payroll）→ 人資長核准（需 approve_payroll 或 job_role=hr_manager；資料庫狀態碼仍記 coo_approved）→ 確認發薪（僅 Admin）',
            ],
            access: '查看本人：所有員工　查看全員 / 批次計算：HR / 管理員（或具 view_payroll 權限者）　確認 / 核准：具對應簽核權限者',
          },
          {
            icon: DollarSign,
            href: '/payroll/annual',
            title: '年度薪資彙總',
            desc: '以年度橫向彙總 1–12 月薪資。查詢「自己」的年度紀錄時不加狀態過濾（僅靠 RLS 把關），本人可看到自己所有狀態（含草稿 / 審核中），與「我的薪資單」只顯示已核准 / 已發放不一致。',
            features: [
              '選年度（當年 ± 2 年）查看自己逐月明細與全年合計',
              '尚無資料月份顯示「—」代表 HR 尚未建立當月薪資',
              '【HR / 管理員】切換「員工」下拉查看任何在職員工的年度彙總',
            ],
            access: '查看本人：所有員工　切換查看他人：HR / 管理員',
          },
          {
            icon: BarChart3,
            href: '/admin/payroll/anomalies',
            title: '薪資異常檢查',
            desc: '掃描指定年月薪資紀錄，標記加班超 46 小時、實發較上月相差逾 20%、無薪假扣款超底薪一半、當月新進 / 離職、正職底薪為 0 等 5 種異常。側邊選單無獨立入口，主要入口是「財務管理設定」內嵌區塊。',
            features: [
              '執行異常掃描：清空該月舊標記後重新掃描並寫回',
              '查看已標記異常：只讀取既有標記，不觸發重新掃描',
              '本頁不能修改薪資，只能標記與檢視，需回薪資表 / 明細頁處理',
            ],
            access: '管理員限定（HR / 財務 / COO 具對應權限者）',
          },
          {
            icon: Landmark,
            href: '/admin/insurance-brackets',
            title: '勞健保 / 勞退級距表管理',
            desc: '上傳並檢視年度勞保 / 健保投保薪資級距表與勞退月提繳工資分級表（同頁兩個獨立區塊）。若當年度未上傳，薪資批次計算算出的保費會直接是 0（畫面提醒但不擋計算）。',
            features: [
              '上傳勞保 / 健保 / 勞退級距表（xlsx / xls / csv，自動辨識中英欄名，含預覽與被略過列原因）；可下載空白範本',
              '整年度覆蓋式上傳（同年度重上傳＝刪除舊表＋寫入新表，同一交易內完成）',
              '依年度切換檢視現有級距表',
            ],
            access: '查看頁面：財務 / COO / 管理員　實際上傳：具財務薪資權限者 / 管理員（財務 / COO 看得到表單，按上傳會 403）',
          },
          {
            icon: Gift,
            href: '/admin/bonuses',
            title: '獎金管理',
            desc: '建立 / 檢視 / 刪除員工獎金紀錄（年終 / 績效 / 專案 / 其他）；薪資批次計算會把「年、月都相符」的獎金併入當月應發金額，月份留空的獎金永遠不會被算入。',
            features: [
              '新增獎金紀錄（員工 / 類型 / 金額 / 選填月份 / 說明）——月份留空則不會被批次計算納入任何月份',
              '刪除獎金紀錄（二次確認，無法復原）',
              '依年度切換檢視，顯示該年度獎金總額',
            ],
            access: '管理：具財務薪資權限者 / 管理員（HR 看得到按鈕但按下會 403）',
          },
          {
            icon: GraduationCap,
            href: '/training',
            title: '教育訓練',
            desc: '訓練課程指派與個人證照到期管理。',
            features: [
              '課程建立與指派（含教材連結、必修標記）',
              '員工標記完成並上傳結業證明；已完成記錄不可由本人自行改回未完成，需管理者操作',
              '證照登錄與到期追蹤（30 天內顯示「即將到期」），僅可新增 / 編輯自己的證照，刪除需管理者',
              '【訓練管理者】可代任一員工新增 / 編輯 / 刪除證照，並可勾選「全部人員」檢視所有人證照',
              '【訓練管理者】「到期提醒」分頁列出全公司 60 天內到期證照',
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
              '主管逐目標評分與總評（需 MFA）→ 完成鎖定結果；受評人本人即使具 HR / 管理員身分也不得核准或評分自己的考核',
              '完成時自動存入該期間每日報告 KPI 快照（目標 vs 實績）',
              'HR / 管理員可切換檢視全公司進度並重新開啟已完成考核（需 MFA）',
            ],
            access: '目標 / 自評：本人　評核：直屬主管（HR / 管理員可切全公司）　週期管理：HR / 管理員',
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
              '審核流程：上傳 → 待審 → 核准 / 退回 → 封存（核准需 MFA，且不可核准自己上傳的文件，INTERNAL 內部文件送出即自動核准）',
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
            desc: '公告總覽分「待確認」「全部」「發布報表」三分頁，卡片點擊皆導向文件詳情頁（/documents/[id]，非 /announcements/[id]）。獨立的公告詳情頁目前無任何入口連結，屬孤兒路由。',
            features: [
              '「待確認」列出尚未確認閱讀的公告；「全部」依分類（緊急 / 行政 / 法規 / HR）與關鍵字篩選',
              '重要公告需完成 MFA 後點擊「確認已讀」；未確認會顯示在儀表板提醒',
              '【發布權限者】「發布報表」分頁查看各公告確認狀態，可對未確認同仁一鍵 Teams 催辦（4 小時冷卻）',
              '【發布權限者】匯出閱讀確認清單為 Excel',
            ],
            access: '查看：所有員工　發布 / 發布報表 / 催辦：具公告發布權限者',
          },
          {
            icon: FileSignature,
            href: '/contracts',
            title: '合約',
            desc: '查看並管理公司對外合約（NDA / MOU / 合約 / 合約修正）。一般同事看不到彼此的合約，僅上傳者本人 / owner / 具審核權限者可見。上傳、封存與 OCR 需改到「文件」頁的同一份文件操作，本頁詳情無這些按鈕。',
            features: [
              '依公司、狀態、類型、關鍵字篩選；到期日以顏色標示（已過期 / 30 天內到期為紅，31–90 天為橘）',
              '審核流程：待審 → 核准 / 退回（核准需 MFA，不可核准自己上傳的合約）',
              '到期自動提醒：到期前 90 天與 30 天透過 Teams 提醒具審核權限者（背景排程，非按鈕觸發）',
              '核准或退回後自動通知申請人；合約類另會知會營運長',
            ],
            access: '查看：管理員或具合約審核權限者可見全部；其餘僅見自己上傳的合約　核准：具合約審核權限者（approve_contract）/ Admin，需 MFA',
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
            desc: '瀏覽公司所有專案卡片（對所有員工可見），建立專案並管理成員、追蹤成員加班情形。專案詳情頁需直接輸入網址進入，列表頁目前沒有連結可點入。',
            features: [
              '瀏覽所有專案卡片：名稱 / 說明 / 負責人 / 狀態 / 成員數',
              '【具建立專案權限者】建立專案、指定負責人（一般授權者僅能將自己設為負責人，Admin 可指定任意人）',
              '任何能看到專案列表的人皆可開啟「成員管理」加人（目前未限制為負責人專屬）',
              '詳情頁（需直接輸入網址）查看專案相關加班申請；專案加班時數超過門檻時自動通知營運長',
            ],
            access: '瀏覽：所有員工　建立：具專案管理權限者　詳情頁：管理員、負責人或成員',
          },
        ],
      },
      {
        name: '採購',
        modules: [
          {
            icon: ShoppingCart,
            href: '/procurement',
            title: '採購總覽',
            desc: '完整採購鏈總覽：詢價 → 請採購 → 進貨驗收 → 入庫 / 出庫 → 請款，並管理供應商、商品與庫存。各單據類型於下方各自獨立分頁維護，本頁彙整入口概念。',
            features: [
              '單據鏈：詢價 → 請採購 → 進貨驗收 → 入庫 / 出庫 → 請款',
              '多關卡簽核引擎（部門主管 / COO / CEO / 會計），核准需 MFA',
              '條碼掃描（掃描槍 / 手機相機）入出庫自動加減量',
              '已核准進貨驗收單可一鍵轉為資產（需 asset_manage 授權）；作廢已核准單據限具採購管理權限者並需 MFA',
            ],
            access: '檢視：具採購權限者',
          },
          {
            icon: FileText,
            href: '/procurement/rfqs',
            title: '詢價單',
            desc: '請購人填列品項並指定詢價人員；詢價人員逐品項登錄多家廠商報價、勾選「採用」後送部門主管簽核，核准後可一鍵轉為請採購單。',
            features: [
              '建立草稿並新增品項；逐品項登錄多家廠商報價並勾選「採用」（同品項僅可採用一筆），可上傳報價單附件',
              '簽核期間詢價人員仍可繼續編輯內容（豁免限制）；送簽：詢價人員本關 → 部門主管關（皆需 MFA）',
              '部門主管無主管或本身是主管時，改由持有 procurement_payment_approve 者代簽避免卡單',
              '核准後按「轉採購單」自動帶入品項與採用單價',
              '【procurement_manage / admin + MFA】「作廢並複製」已核准 / 駁回單',
            ],
            access: '檢視 / 建立：具採購權限者',
          },
          {
            icon: ShoppingCart,
            href: '/procurement/purchase-requests',
            title: '請採購單',
            desc: '記錄向廠商下單品項 / 金額 / 付款條件，走「部門主管 → COO（合計 > 3,000）→ CEO（合計 > 20,000）→ 通知採購」簽核鏈，核准後可轉進貨驗收單或訂金請款單。',
            features: [
              '選廠商自動帶統編 / 聯絡人 / 付款資訊；小計 / 稅額 / 合計一律由伺服器重新計算並覆蓋前端值',
              '送簽後依合計金額自動決定是否加開 COO / CEO 關卡（門檻可於「營運長設定」調整），通知採購一律保留',
              '核准後可轉「進貨驗收單」或「訂金請款單」',
              '【procurement_manage / admin + MFA】僅作廢或作廢並複製',
              '同一張請採購單只能有一張未作廢的採購請款單（v1.0.4 起）',
            ],
            access: '檢視 / 建立：具採購權限者',
          },
          {
            icon: Package,
            href: '/procurement/goods-receipts',
            title: '進貨驗收單',
            desc: '記錄廠商到貨驗收結果 / 金額 / 發票資訊，經「最後修改人員 → 任一採購人員」兩段確認後可轉入庫單 / 請款單，或（限資產管理者）直接轉資產。',
            features: [
              '可帶入來源請採購單號；填廠商 / 金額 / 發票資訊，上傳發票與出貨單據',
              '勾選「已付訂金」並填訂金請款單號與金額（訂金請款單核准後可自動回填）',
              '送簽（最後修改人員確認 → 任一採購單位人員確認，皆需 MFA）',
              '【asset_manage 授權】核准後「轉為資產」一鍵轉入資產模組',
              '【procurement_manage / admin + MFA】「作廢並複製」；有未作廢下游單據時會被擋下並列出擋單單號',
            ],
            access: '檢視 / 建立：具採購權限者',
          },
          {
            icon: Building2,
            href: '/procurement/vendors',
            title: '廠商主檔',
            desc: '維護採購廠商基本 / 聯絡 / 帳務 / 銀行等欄位，供詢價單 / 請採購單等自動帶入。目前介面無刪除功能。',
            features: [
              '瀏覽廠商清冊（可搜尋 / 排序 / 分頁），點列開啟詳情彈窗查看完整欄位',
              '【procurement_manage / admin】新增 / 編輯廠商（一般 procurement_unit 看不到此按鈕）',
              '不需 procurement_manage 的建立管道：填「廠商審核評估」送 COO 簽核，核准後自動寫入並產生廠商編號',
            ],
            access: '檢視：具採購權限者　新增 / 編輯：具採購管理權限者',
          },
          {
            icon: Package,
            href: '/procurement/products',
            title: '商品主檔',
            desc: '維護採購商品資料與「採購單位 × 換算率 = 庫存單位」雙單位換算設定，可查看各廠商歷史報價供比價。',
            features: [
              '瀏覽商品清冊，表格顯示雙單位換算與目前庫存量',
              '點列開啟詳情彈窗：規格 / 類別 / 庫存量、雙單位換算公式、歷次比價表（廠商報價來自詢價單核准後自動寫入，非本頁手動維護）',
              '點商品名稱可進入「商品出入庫分類帳」查庫存異動歷史（純查詢）',
              '【procurement_manage / admin】新增 / 編輯 / 刪除商品',
            ],
            access: '檢視：具採購權限者　新增 / 編輯 / 刪除：具採購管理權限者',
          },
          {
            icon: ClipboardList,
            href: '/procurement/evaluations',
            title: '廠商 / 商品審核評估',
            desc: '以簽核流程登記新廠商資料，或記錄比價來源備註的兩張表單（同頁兩分頁）；廠商評估核准後自動寫入廠商主檔。商品評估僅登記來源詢價單號與備註，不含品項比價編輯器，不會自動登錄比價結果。',
            features: [
              '「廠商評估」：填廠商欄位＋備註草稿，送簽固定由 COO 核准，核准後自動寫入廠商主檔並產生編號',
              '「商品評估」：填來源詢價單號＋備註，送簽由直屬主管核准（無主管則自簽）',
              '詳情彈窗查看簽核時間軸，輪到自己可核准 / 駁回（需 MFA）',
            ],
            access: '檢視 / 建立：具採購權限者',
          },
          {
            icon: Package,
            href: '/procurement/inventory',
            title: '庫存作業（入庫 / 出庫 / 查詢）',
            desc: '入庫單把貨物收進倉庫寫入批號庫存；出庫單把庫存扣出（領用 / 消耗 / 報廢）；「庫存查詢」用掃描槍或手機相機掃貨號 / 批號快速查現存量。三分頁共用同一組登入權限。',
            features: [
              '新增入庫 / 出庫單草稿（可手動填單或掃碼自動帶入 / 累加批號），送簽為單一關卡，由建檔人本人自行確認即核准（仍需 MFA）',
              '過帳：入庫寫入批號庫存與分類帳（同一張驗收單累計入庫量不得超過驗收數量）；出庫扣減庫存（不足會被擋下）',
              '沖銷過帳：反向沖銷已過帳單據；批號已被後續出庫用掉會被擋下',
              '已核准單無法刪除也無法作廢，僅能沖銷過帳或洽管理員',
              '【procurement_manage / admin】可編輯 / 刪除任何人草稿並代為沖銷；庫存查詢分頁純查詢無寫入動作',
            ],
            access: '檢視 / 操作：具採購權限者',
          },
          {
            icon: Receipt,
            href: '/procurement/payments',
            title: '請款單（訂金 / 應付 / 分期）',
            desc: '訂金請款單通常由請採購單轉單產生；採購請款單通常由已核准進貨驗收單轉單產生；分期請款單僅能從採購請款單明細頁「建立分期請款」逐期產生。三種文件皆無刪除或作廢按鈕。',
            features: [
              '由來源單轉單產生草稿（銀行資訊自動帶入），或直接手動建立；同一張請購單只能有一張未作廢的採購請款單（v1.0.4 起）',
              '編輯金額 / 匯款期限 / 銀行資訊，送簽（單一會計關卡）',
              '【job_role=finance 或 admin + MFA】核准 / 退回；建立者本人不可核准自己送出的單（職責分立）',
              '採購請款單勾選分期後，核准後可按「建立分期請款」逐期產生（期數自動編號）',
              '訂金請款單核准後對應進貨驗收單自動帶入已付訂金資訊',
            ],
            access: '檢視 / 建立：具採購權限者　核准：財務或管理員',
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
              '「到期提醒」分頁列出 60 天內到期或已逾期的校驗 / 保養項目，全員可見（已報廢資產不會出現）',
              '可由採購已核准的進貨驗收單一鍵轉入資產（同一張驗收單只能轉一次，避免金額重複計入台帳）',
            ],
            access: '檢視：所有員工（唯讀，含到期提醒）　異動：具資產管理權限者',
          },
          {
            icon: FlaskConical,
            href: '/lab',
            title: '試劑耗材',
            desc: '試劑與耗材的批號、效期與領用管理。全員可查閱品項 / 批次 / 到期提醒，但「異動記錄」明細僅管理者可見。',
            features: [
              '品項清單依關鍵字 / 類別搜尋，展開查看所有批次（批號 / 效期 / 數量）；切換「到期提醒」查看未來 60 天內到期批次',
              '【lab_manage 授權或 admin】新增 / 編輯 / 刪除品項；入庫新批次（批號 / 效期 / 數量）',
              '【lab_manage 授權或 admin】對批次執行「使用」/「開封」/「報廢」（庫存扣帳為原子交易）',
              '【lab_manage 授權或 admin，一般員工看不到】查看批次完整異動記錄（含操作人與時間）',
            ],
            access: '查閱（不含異動記錄）：所有員工　異動與異動記錄：具試劑耗材管理權限者',
          },
        ],
      },
      {
        name: '其他',
        modules: [
          {
            icon: MessageSquarePlus,
            href: '/feedback',
            title: '意見回饋',
            desc: '查看自己送出的意見回饋歷程與處理狀態，可在留言串追加說明；提交後具名、僅 Admin 可查看（非匿名）。',
            features: [
              '檢視自己送出的所有回饋（類型 / 狀態 / 送出時間 / 附圖）',
              '點「新增回饋」導向送出表單：選類型（功能建議 / 錯誤回報）、填標題與說明，選填一張截圖',
              '在留言串回覆管理員；若已是「完成」或「退回」，追加留言會自動重新開啟為「待處理」',
              '本頁僅顯示自己的回饋；Admin 需於「意見回饋管理」查看全公司回饋並變更處理狀態',
            ],
            access: '查看：僅本人自己的回饋',
          },
          {
            icon: Settings,
            href: '/settings',
            title: '個人設定',
            desc: '管理個人偏好設定，每位使用者僅能查看 / 修改自己的設定（與僅 Admin 可用的「系統設定」是兩個不同頁面）。',
            features: [
              '修改顯示名稱',
              '切換介面語言（繁體中文 / English / 日本語）',
              '切換深色 / 淺色模式',
              '管理雙因素驗證（MFA）：可自行重置，下次登入需重新掃碼設定',
            ],
          },
        ],
      },
      {
        name: '人事行政（管理）',
        modules: [
          {
            icon: UsersRound,
            href: '/admin/users',
            title: '使用者管理',
            desc: '全公司帳號清單，調整部門 / 系統角色 / 職能角色 / 僱用資訊，對離職同仁停用帳號。帳號無法在此新增，一律由同仁本人首次用 Entra 登入時自動建立。',
            features: [
              '編輯部門 / 僱用類型 / 工作地區 / 直屬主管 / 代理審核人 / 啟用狀態',
              '【僅 Admin】編輯系統角色、職能角色（hr_manager / finance / coo / ceo）與個別授權功能旗標',
              '【僅 Admin】停用使用者前顯示「離職交接檢查」（未結案合約 / 進行中專案 / 待審申請 / 未發放薪資）；非 Admin 的 HR 停用帳號僅能改用「編輯」對話框改狀態，看不到交接提醒',
              '【僅 Admin】點人事資料圖示進入編輯薪資與個人資料（HR 點了會被導向無權限頁）',
            ],
            access: '查看 / 部分編輯：HR（需個別授權，僅設 job_role 不夠）/ 管理員　完整編輯（角色 / 停用管理員）：僅管理員',
          },
          {
            icon: Building2,
            href: '/admin/departments',
            title: '部門管理',
            desc: '維護部門清單（代碼＋名稱），供使用者管理 / 招募 / 簽核等模組下拉選單使用。僅能新增與編輯，無刪除功能。',
            features: [
              '新增部門（名稱＋代碼，限 10 字內、自動轉大寫）',
              '編輯既有部門名稱 / 代碼',
            ],
            access: '管理員限定（HR 皆無法進入）',
          },
          {
            icon: Building2,
            href: '/admin/companies',
            title: '公司主檔',
            desc: '維護「合作公司」主檔（名稱＋別名清單），供合約管理 / 文件管理選擇所屬公司使用。此處的「公司」是外部往來公司，非 myOPS 自家法人清單。',
            features: [
              '搜尋既有公司（依名稱或別名）',
              '新增公司（名稱＋逗號分隔別名清單）',
              '編輯既有公司名稱 / 別名（無刪除功能）',
            ],
            access: '管理員限定',
          },
          {
            icon: LogOut,
            href: '/admin/lifecycle',
            title: '入職／離職流程',
            desc: 'HR 追蹤每位新進 / 離職員工交接清單（入職 10 項 / 離職 8 項預設範本）。側邊欄目前沒有此頁連結給非 Admin 的 HR，須知道網址才能進入；功能預設關閉需 Admin 先開啟。',
            features: [
              '選同仁與類型（入職 / 離職）建立自動展開預設範本的交接清單',
              '逐項打勾完成（記錄時間）、寫備註、新增自訂項目',
              '全部完成標記整張清單「已完成」；反勾任一項目自動退回「進行中」',
            ],
            access: 'HR（個別授權）/ 管理員（HR 無側邊欄入口，需知道網址）',
          },
          {
            icon: UserPlus,
            href: '/admin/recruiting',
            title: '招募管理',
            desc: '管理職缺與應徵者（投遞 → 書審 → 面試 → Offer → 錄取 / 未錄取）。側邊欄同樣沒有給非 Admin 的 HR 入口，且功能預設關閉。履歷檔案僅 HR / 管理員可下載。',
            features: [
              '建立 / 編輯 / 關閉職缺（標題、部門、需求條件、招募人數）',
              '新增應徵者並上傳履歷；拖動切換階段：投遞 → 書審 → 面試 → Offer → 錄取 / 未錄取',
              '新增面試記錄（日期、1–5 星評分、文字回饋）',
            ],
            access: 'HR（個別授權）/ 管理員（HR 無側邊欄入口，需知道網址）',
          },
          {
            icon: UsersRound,
            href: '/admin/hr-settings',
            title: 'HR 管理',
            desc: '人資設定彙整頁，內嵌打卡 / 加班參數、假別管理、加班費率、出勤異常清單（唯讀）、年度獎金記錄。本頁 HR 判定用 job_role，與使用者管理 / 入職離職 / 招募用 granted_features 判定不是同一套機制。',
            features: [
              '編輯打卡 / 加班系統參數（預設上下班時間、自動打卡提醒天數等）',
              '假別管理、加班費率管理區塊（與獨立頁功能相同）',
              '檢視出勤異常清單（近 30 天自動補卡異常、本月漏打卡實習生）',
              '年度獎金記錄管理；COO 進入本頁各區塊皆為唯讀（鎖頭圖示）',
            ],
            access: '查看：HR / COO / 管理員　編輯：HR（job_role）/ 管理員',
          },
        ],
      },
      {
        name: '系統管理',
        modules: [
          {
            icon: Settings,
            href: '/admin/settings',
            title: '系統設定',
            desc: '功能模組開關、AI 連線（供應商 / API Key / 模型 / Embedding）與打卡 / 通知 / 系統參數等全站設定。與財務管理設定 / 營運長設定不同，本頁沒有給其他職能角色的唯讀檢視。',
            features: [
              '逐模組一鍵開 / 關（出勤 / 請假 / 薪資 / 文件 / 採購…等），關閉後一般員工完全看不到也用不到該模組',
              'AI 連線設定：選供應商、填 API Key / 模型，「測試連線」即時驗證',
              'Embedding 設定：啟用政策問答向量檢索；換模型後需按「重建文件索引」全量重跑',
              '敏感值（API Key、Teams Bot Secret）永不回傳前端，畫面只顯示「已設定 / 未設定」',
            ],
            access: '管理員限定（HR / 財務 / COO 皆進不了此頁，含唯讀）',
          },
          {
            icon: Landmark,
            href: '/admin/finance-settings',
            title: '財務管理設定',
            desc: '薪資相關系統參數（發薪日等）、勞健保 / 勞退級距表與薪資異常掃描的管理入口（與獨立頁面共用同一元件）。',
            features: [
              '編輯「發薪日」與「薪資自動產出日」',
              '管理勞保 / 健保 / 勞退月提繳工資三張級距表',
              '執行薪資異常掃描',
            ],
            access: '查看（唯讀）：COO / 管理員　編輯：財務 / 管理員（HR 無此頁存取權）',
          },
          {
            icon: ShieldCheck,
            href: '/admin/coo-settings',
            title: '營運長設定',
            desc: '專案加班 Teams 通知門檻、合約到期提醒天數，以及請採購單依金額分級的簽核門檻等營運政策參數。',
            features: [
              '設定「專案加班 COO 審批門檻（小時）」：超過門檻 Teams 通知所有在職 COO（純提醒，非額外簽核關卡）',
              '設定合約到期第一次 / 第二次提醒天數',
              '設定請採購單金額分級簽核門檻（COO / CEO 關卡），草稿頁會即時預覽會經過的關卡',
            ],
            access: '查看（唯讀）：HR / 管理員　編輯：COO / 管理員（財務無此頁存取權）',
          },
          {
            icon: Bot,
            href: '/admin/bot-policy',
            title: 'Teams 一鍵簽核政策設定',
            desc: '逐一控制 10 種採購單據類型在 Teams 卡片上走「深連結」還是「一鍵直簽」。預設全部關閉（深連結＋MFA 最安全模式），開啟後犧牲 MFA 保護換取速度。',
            features: [
              '逐一開關 10 種採購單據類型的 Teams 一鍵直簽（預設全關）',
              '對有金額欄位的單據類型設定一鍵直簽金額門檻，達到或超過門檻仍強制走深連結＋MFA',
              '設定即時生效於下一張新通知，已送出的舊卡片不會被追溯撤銷；核准時仍會重新比對當前政策，避免舊卡片繞過新收緊的政策',
              '此設定只管採購 10 種單據；請假 / 加班 / 報帳等其他簽核的 Teams 通知一律純文字＋深連結',
            ],
            access: '管理員限定',
          },
          {
            icon: ScrollText,
            href: '/admin/audit',
            title: '稽核紀錄',
            desc: '全站稽核日誌查詢頁：搜尋 / 篩選文件相關稽核事件（上傳 / 核准 / 退回 / 確認閱讀 / 封存 / OCR 等）。「關聯文件」欄位為純文字，非可點連結。',
            features: [
              '關鍵字搜尋動作類型、下拉篩選單一動作類型',
              '每頁 50 筆分頁瀏覽（時間 / 操作人 / 動作 / 關聯文件標題 / 備註）',
            ],
            access: 'Admin / HR（一般員工僅限自己有權限文件的側邊稽核區塊）',
          },
          {
            icon: MessageSquarePlus,
            href: '/admin/feedback',
            title: '意見回饋管理',
            desc: '全公司意見回饋管理列表：檢視所有人提交的回饋、篩選、變更處理狀態、在留言串回覆提交者。',
            features: [
              '依狀態（待處理 / 處理中 / 已完成 / 已退回）與類型篩選',
              '下拉切換單筆回饋的處理狀態',
              '開啟詳情查看完整描述、附圖並回覆提交者；提交者在已完成 / 已退回的單子追加留言會自動重開為待處理',
            ],
            access: '管理員限定（含 HR 皆無法進入）',
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
          { feature: '請假行事曆 /leave/calendar', employee: '△', manager: '△', hr: true, admin: true, note: '孤兒頁面；一般員工 / 主管僅同部門' },
          { feature: '營運儀表板', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: '出勤管理',
        rows: [
          { feature: '打卡（上/下班）', employee: true, manager: true, hr: true, admin: true },
          { feature: '補打卡申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '補打卡審核', employee: false, manager: true, hr: true, admin: true },
          { feature: '查看全員出勤 / 作廢紀錄', employee: false, manager: false, hr: true, admin: true, note: 'HR 判定含 job_role，與其他頁不同' },
          { feature: '打卡範圍設定 /admin/geofences', employee: false, manager: false, hr: false, admin: true, note: '唯一只認 admin 的頁面' },
          { feature: '班別管理 /admin/shifts', employee: false, manager: false, hr: '△', admin: true, note: '不含 COO，與其他 3 頁不同' },
          { feature: '出勤異常 /admin/attendance-anomalies', employee: false, manager: false, hr: '△', admin: true, note: '僅認 job_role，不含個別授權' },
        ],
      },
      {
        name: '請假 / 加班',
        rows: [
          { feature: '請假申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '請假審核', employee: false, manager: true, hr: true, admin: true, note: 'HR 判定不含 job_role，與打卡不同' },
          { feature: '已核准請假撤銷', employee: '△', manager: false, hr: true, admin: true, note: '未開始的假可自撤；已開始限 HR/admin' },
          { feature: '假別管理 / 假別額度', employee: false, manager: false, hr: '△', admin: true, note: '僅認 job_role，不含個別授權' },
          { feature: '加班申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '加班審核', employee: false, manager: true, hr: false, admin: true, note: 'HR 不能核准，僅主管 / 專案負責人 / admin' },
        ],
      },
      {
        name: '出差',
        rows: [
          { feature: '出差申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '出差審核', employee: false, manager: true, hr: true, admin: true, note: '審批人固定為送單當時的主管' },
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
          { feature: '查看全員薪資 / 批次計算', employee: false, manager: false, hr: true, admin: true, note: '批次計算為人工按鈕，非排程自動' },
          { feature: '薪資確認 / 核准', employee: false, manager: false, hr: false, admin: '△', note: '需 confirm/approve_payroll 授權' },
          { feature: '年度薪資彙總（查看他人）', employee: false, manager: false, hr: true, admin: true, note: '需 view_payroll 授權' },
          { feature: '薪資異常檢查 /admin/payroll/anomalies', employee: false, manager: false, hr: '△', admin: true, note: '需財務薪資相關授權' },
          { feature: '勞健保 / 勞退級距表上傳', employee: false, manager: false, hr: '△', admin: true, note: '需 finance_payroll；財務 / COO 僅看得到表單' },
          { feature: '獎金管理 /admin/bonuses', employee: false, manager: false, hr: '△', admin: true, note: '需 finance_payroll；HR 看得到按鈕但會 403' },
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
          { feature: '採購作業 / 建立單據（詢價 / 請採購 / 驗收）', employee: false, manager: '△', hr: false, admin: '△', note: '需採購權限，不看角色本身' },
          { feature: '採購簽核（部門主管→COO→CEO）', employee: false, manager: '△', hr: false, admin: '△', note: '門檻可於營運長設定調整' },
          { feature: '入庫單 / 出庫單核准', employee: false, manager: '△', hr: false, admin: '△', note: '建檔人本人自行確認，需 MFA' },
          { feature: '請款核准（訂金 / 應付 / 分期）', employee: false, manager: false, hr: false, admin: '△', note: '需財務角色；不可核准自己的單' },
          { feature: '廠商 / 商品主檔新增編輯', employee: false, manager: '△', hr: false, admin: '△', note: '需採購管理權限；或走廠商評估自動寫入' },
          { feature: '轉為資產（驗收單→資產）', employee: false, manager: '△', hr: false, admin: '△', note: '需 asset_manage 授權，僅可轉一次' },
          { feature: '作廢已核准單據', employee: false, manager: false, hr: false, admin: '△', note: '僅 RFQ/PR/GR 有作廢入口，需 MFA' },
        ],
      },
      {
        name: 'Teams 一鍵簽核',
        rows: [
          { feature: 'Teams 一鍵簽核政策設定 /admin/bot-policy', employee: false, manager: false, hr: false, admin: true, note: '僅 admin；預設全部關閉（深連結 + MFA）' },
          { feature: 'Teams 一鍵核准／退回卡片', employee: '△', manager: '△', hr: '△', admin: '△', note: '僅 10 種採購單據；其餘一律深連結 + MFA' },
          { feature: 'Teams 文字指令查詢', employee: true, manager: true, hr: true, admin: true, note: '僅回覆自己的資料；AI fallback 需開關' },
        ],
      },
      {
        name: '資產 / 試劑耗材',
        rows: [
          { feature: '查看資產 / 庫存 / 到期提醒', employee: true, manager: true, hr: true, admin: true },
          { feature: '資產異動管理', employee: false, manager: '△', hr: '△', admin: '△', note: '需 asset_manage 授權' },
          { feature: '試劑耗材—異動記錄 / 管理操作', employee: false, manager: '△', hr: '△', admin: '△', note: '查閱全員可見，異動記錄限管理者' },
        ],
      },
      {
        name: '專案 / 其他',
        rows: [
          { feature: '瀏覽專案列表', employee: true, manager: true, hr: true, admin: true, note: '對所有人可見，未依成員身分過濾' },
          { feature: '建立專案／指定負責人', employee: false, manager: false, hr: false, admin: true, note: '需 manage_projects 授權' },
          { feature: '專案成員管理', employee: true, manager: true, hr: true, admin: true, note: '目前未限制為負責人專屬' },
          { feature: '意見回饋（具名）', employee: true, manager: true, hr: true, admin: true },
          { feature: '查看回饋', employee: false, manager: false, hr: false, admin: true },
          { feature: '管理後台', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: '人事行政（管理）',
        rows: [
          { feature: '使用者管理 /admin/users', employee: false, manager: false, hr: '△', admin: true, note: '需個別授權（僅 job_role 不夠）' },
          { feature: '使用者人事資料 /admin/users/[id]/profile', employee: false, manager: false, hr: false, admin: true, note: '權限最狹：HR 也不行，本人也看不到' },
          { feature: '部門管理 / 公司主檔', employee: false, manager: false, hr: false, admin: true, note: '僅 admin，HR 皆無法進入' },
          { feature: '入職／離職流程 /admin/lifecycle', employee: false, manager: false, hr: '△', admin: true, note: '需個別授權，且無側邊欄入口' },
          { feature: '招募管理 /admin/recruiting', employee: false, manager: false, hr: '△', admin: true, note: '同上；預設關閉，履歷限 HR/admin 下載' },
          { feature: 'HR 管理 /admin/hr-settings', employee: false, manager: false, hr: '△', admin: true, note: 'HR 需 job_role 才可編輯；coo 唯讀' },
        ],
      },
      {
        name: '系統管理',
        rows: [
          { feature: '系統設定 /admin/settings', employee: false, manager: false, hr: false, admin: true, note: '連唯讀都不開放給其他角色' },
          { feature: '財務管理設定 /admin/finance-settings', employee: false, manager: false, hr: false, admin: true, note: 'coo 唯讀；finance 可編輯；HR 無存取權' },
          { feature: '營運長設定 /admin/coo-settings', employee: false, manager: false, hr: '△', admin: true, note: 'HR 唯讀；coo 可編輯；finance 無此頁' },
          { feature: '稽核紀錄 /admin/audit', employee: false, manager: false, hr: true, admin: true, note: 'admin/hr 可查全站；員工限單一文件' },
          { feature: '意見回饋管理 /admin/feedback', employee: false, manager: false, hr: false, admin: true, note: '僅 admin；含 HR 皆無法進入' },
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
            desc: 'Every request awaiting your review, in one place — approve or reject without page-hopping. Approve/reject calls each module\'s own API directly; this page is just a unified inbox, not a separate approval system.',
            features: [
              'Consolidates pending items: leave, overtime, missed clock-ins, expenses, documents / contracts, payroll, procurement, business trips',
              'One-tap approve or reject (a reason is required to reject)',
              'Shows applicant, type, date and amount',
              'Amount-based documents and sensitive actions require MFA',
              'Teams one-tap approval only covers 10 procurement document types (per admin policy); every other notification (leave / overtime / expenses / documents & contracts / payroll) is plain text and requires opening the web page plus MFA',
            ],
            access: 'Approve: based on the approval permission for each request type',
          },
          {
            icon: CalendarRange,
            href: '/calendar',
            title: 'Calendar',
            desc: 'One monthly calendar for company events, approved leave and business trips. You can RSVP to company events.',
            features: [
              'Company events (green), colleagues on leave (blue), approved trips (purple, shows destination)',
              'Click a date to see the full list for that day; RSVP to company events (attending / not attending / undecided)',
              'Leave shows only "On leave" — not the leave type (a deliberate change since v0.9.9, for health-privacy reasons); to see leave types, use the "Leave Calendar" (visible to the same department / HR, for scheduling)',
              'HR / Admin can create, edit and delete company events',
              'Approved leave / trips auto-create an all-day "Out of Office" event on the person\'s Outlook (one-way sync; first use requires a re-login to authorize)',
            ],
            access: 'View: all staff　Manage events: HR / Admin',
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
            desc: 'File your daily schedule and KPIs directly in myOPS. Tap the circle next to a schedule item to mark it done — that is your completion report.',
            features: [
              'Two tabs: Schedule / KPI (the separate Completion tab has been merged into the schedule done-checkmarks)',
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
            desc: 'View group members\' daily schedule and completion progress by group; group leads (Viewers) also see KPIs and manage KPI metrics.',
            features: [
              'Regular members in the same group can also see each other\'s schedule and completion progress (KPIs excluded — by design, so members can track each other\'s progress)',
              'Group leads (Viewers) additionally see each member\'s KPI values',
              '[Viewer / Admin] Manage KPI metrics: add / edit / disable (reversible) / permanently delete',
              'Admin can switch to view any group',
            ],
            access: 'View: members of the same group (excludes KPIs)　KPI & metric management: group lead (Viewer) / Admin',
          },
          {
            icon: UsersRound,
            href: '/admin/daily-report/groups',
            title: 'Daily Report Group Management',
            desc: 'Create daily report groups and assign members and viewers (leads) — the first step to turning on the whole Daily Report feature.',
            features: [
              'Create / edit / delete groups (name, description)',
              'Add members and assign a role: member (files reports) or viewer (lead)',
              'The "Daily Report" feature must be turned on in System Settings first, then groups created and members assigned, before members see anything in "My Daily Report"',
            ],
            access: 'Admin only',
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
            desc: 'Clock in / out and look up your own attendance history. HR / Admin use the same page\'s "All Records" tab to view company-wide records and void anomalous entries. The old /admin/attendance route now just redirects here — it\'s no longer a separate page.',
            features: [
              'One-tap clock in / clock out (includes GPS; if Admin enables "enforced geofencing," you must be inside a fence to succeed)',
              '"My Records" — browse your clock history and hours by year / month',
              'Apply for a missed clock (reason required); the approver is assigned automatically (usually your manager), and approval requires MFA',
              'Flexible shifts: lateness is judged against your assigned shift\'s start time for that day (falls back to the default if unassigned)',
              '[HR / Admin] "All Records" — filter by month / employee / employment type, and void anomalous records (reason required) or restore them; both actions require MFA',
            ],
            access: 'Clock: all staff　View & void all records: HR / Admin (HR here is judged by job_role, unlike Leave / Overtime / Business Trips)',
          },
          {
            icon: MapPin,
            href: '/admin/geofences',
            title: 'Geofences',
            desc: 'Define the office locations where clocking in is allowed (multiple locations supported), and toggle "enforced range checking." This is the only attendance-related page restricted to role=admin — no HR variant can enter it.',
            features: [
              'Toggle "enforced clock-in range checking" (off by default — coordinates are recorded but not blocked)',
              'Add a fence (name, latitude/longitude or your current location, radius)',
              'Enable / disable / delete fences; multiple fences are allowed, and clocking in inside any one of them qualifies',
            ],
            access: 'Admin only (not visible to HR or COO)',
          },
          {
            icon: Clock,
            href: '/admin/shifts',
            title: 'Shift Management',
            desc: 'Define shifts and assign them to employees; lateness is judged against the start time of the employee\'s shift for that day.',
            features: [
              'Create / edit shifts (name, start/end times, working days, grace period, break minutes, active status)',
              'Assign each employee their current shift (only active shifts are listed)',
            ],
            access: 'Manage: HR / Admin (excludes COO, unlike Leave Types / Leave Balances / Attendance Anomalies)',
          },
          {
            icon: BarChart3,
            href: '/admin/attendance-anomalies',
            title: 'Attendance Anomalies',
            desc: 'A read-only report: full-time staff with 3+ consecutive days of auto-filled clock-ins (forgot to clock) in the last 30 days, and interns who missed clocking in more than 3 times this month.',
            features: [
              '"Full-time staff — repeated auto-fill" list (5+ days highlighted in red)',
              '"Interns — missed clock-ins" list',
              'Data display only — no export or "mark as handled" action',
            ],
            access: 'View: HR (job_role only) / COO / Admin (individual permission grants don\'t apply here)',
          },
          {
            icon: CalendarDays,
            href: '/leave',
            title: 'Leave',
            desc: 'Apply for leave, check your balance, and view your leave history. HR / Admin can view everyone\'s records and revoke approved leave on someone\'s behalf.',
            features: [
              'Supports multiple leave types (annual, sick, personal, etc.) — annual leave follows your work anniversary, other types follow the calendar year',
              'View your available balance; special leave types (marriage / bereavement / maternity, etc.) require a "Special Leave Request" first, approved by HR for a number of days, before you can formally apply',
              'Approval flow: Submit → manager / HR / Admin approves or rejects (reason required to reject; approval requires MFA)',
              'You can cancel your own approved leave before it starts; once it has started, only HR / Admin can revoke it on your behalf',
              'Once approved, an all-day "Out of Office" event is auto-created on Outlook; rejecting or cancelling removes it automatically (first use requires a re-login to authorize)',
            ],
            access: 'Apply: all staff　Approve: direct manager / HR / Admin　View all records & revoke approved leave: HR / Admin (HR here is not judged by job_role, unlike the Attendance page)',
          },
          {
            icon: CalendarRange,
            href: '/leave/calendar',
            title: 'Leave Calendar',
            desc: 'A monthly calendar view of leave across a department or the whole company (including leave type and reason), for managers coordinating schedules. Nothing in the app currently links here — it\'s an "orphan page" you have to reach by typing the URL directly.',
            features: [
              'Monthly view of how many people are on leave each day (approved = green dot, pending = yellow dot)',
              'Click a day to filter that day\'s leave list (name / leave type / period / days / status)',
              'Regular staff see only their own department; HR / Admin can switch departments or view the whole company via a dropdown',
              'Read-only, and deliberately different from /calendar: this page shows leave type (for same-department / HR scheduling use), while /calendar has intentionally hidden leave type since v0.9.9',
            ],
            access: 'View: all staff (regular staff limited to their own department)　Company-wide view: HR / Admin',
          },
          {
            icon: CalendarDays,
            href: '/admin/leave-types',
            title: 'Leave Types',
            desc: 'Maintain the company\'s leave types (name / who it applies to / pay type / annual cap / advance-notice days / active status) — the data source for the dropdown on the Leave page. There\'s no read-only mode here; COO can fully edit too.',
            features: [
              'Create a leave type (name / applicability / pay type / annual cap / advance-notice days / active status)',
              'Edit an existing leave type — changes take effect immediately on save',
              'Whether HR pre-approval is required has no UI control yet; it must be set directly on the backend',
            ],
            access: 'Manage: HR (job_role only) / COO / Admin',
          },
          {
            icon: ListChecks,
            href: '/admin/leave-balances',
            title: 'Leave Balances',
            desc: 'Adjust granted days per employee and per leave type for the current year (or the current annual-leave anniversary period) — the data source for the balance employees see on the Leave page. Since v0.9.7 this is the only sidebar entry point for it, and it also has no read-only mode.',
            features: [
              'Adjust the current year\'s granted days per employee / leave type (spreadsheet-style input)',
              '"Auto-fill annual leave by seniority" batch-generates / updates annual-leave balances without overwriting anything already adjusted manually',
              'Filter to a single employee via a dropdown; see days used per leave type',
            ],
            access: 'Manage: HR (job_role only) / COO / Admin',
          },
          {
            icon: Timer,
            href: '/overtime',
            title: 'Overtime',
            desc: 'Apply for overtime hours; overtime pay is calculated in tiers per the Labor Standards Act. HR / Admin can view everyone\'s records, but HR cannot approve overtime.',
            features: [
              'Enter the overtime date, time range, and a description; the day type (workday / rest day / public holiday) is detected automatically from the date',
              'Can be linked to a specific project',
              'The "Pending" tab shows every pending overtime request company-wide to any logged-in employee, but clicking approve returns a 403 unless you\'re the direct manager, the project lead, Admin, or hold the coo_notify permission — visibility isn\'t the same as approval rights, and this is not a permission leak',
              'HR (granted_features includes hr_manager) can never approve overtime — only view "All Records"',
              'Approved overtime is paid in tiers per Labor Standards Act §24/§39 (different multipliers for workday / rest day / public holiday) and feeds into the payroll draft; this requires MFA',
            ],
            access: 'Apply: all staff　Approve: direct manager / project lead / Admin (HR cannot approve overtime)　All records: HR / Admin',
          },
          {
            icon: Plane,
            href: '/business-trips',
            title: 'Business Trips',
            desc: 'Apply for business trips and manage itineraries; approval syncs to Outlook. The approver is fixed at the time of submission (your direct manager then) — even if your manager later changes, the approver on that request stays the same.',
            features: [
              'Enter destination, purpose and itinerary → approved by your manager at the time of submission (requires MFA)',
              'The applicant can cancel a pending request',
              'Included in Approvals for one-tap approve / reject',
              'An approved trip can prefill the expense form with one click (category and purpose pre-filled)',
              'Once approved, an all-day "Out of Office" event is auto-created on Outlook and removed automatically if rejected (first use requires a re-login to authorize)',
            ],
            access: 'Apply: all staff　Approve: your manager at time of submission / HR / Admin　All records: HR / Admin',
          },
          {
            icon: Receipt,
            href: '/expenses',
            title: 'Expenses',
            desc: 'File, approve and reimburse out-of-pocket expenses online. Since v0.10.2 this uses accounting-category classification. Only TWD amounts are supported for now.',
            features: [
              'Choose an accounting category, enter the expense date / claim month, invoice number, description and amount (TWD)',
              'Upload invoice / receipt photos or PDFs (multiple allowed)',
              'After submission, an authorized reviewer approves, rejects or marks it as reimbursed (all three require MFA, and reviewers cannot approve their own submissions)',
              'You can cancel a pending request yourself (marked cancelled, not deleted; no MFA required)',
              'Can link an approved business trip with one click; expense reviewers can export details to Excel',
            ],
            access: 'Apply: all staff　Approve, reimburse & view all records: staff with expense-approval permission',
          },
          {
            icon: DollarSign,
            href: '/payroll',
            title: 'Payroll',
            desc: 'Regular staff only see "My Payslips" (approved or paid entries only). HR / Finance / staff with view permission get an extra "Payroll Table" tab for batch calculation, manual entry and bulk approval. Batch calculation is triggered manually — there\'s no scheduled auto-run.',
            features: [
              '"My Payslips": the last 12 months of approved / paid payslips, with a breakdown of gross pay / deductions / net pay / employer costs and the approval trail',
              '[HR / Admin] Batch calculation: generates the month\'s payroll draft from base salary / approved overtime / unpaid-leave deductions / bonuses / labor & health insurance brackets (re-running overwrites entries already in the approval flow and clears their approval trail — you\'re warned how many records are affected first)',
              '[HR / Admin] Bulk approval: advances every payslip at the same approval stage in one action; each one is still checked individually for MFA and state underneath',
              'Payroll has four approval stages: HR review → Finance confirmation (requires confirm_payroll) → HR-director approval (requires approve_payroll or job_role=hr_manager; the database status code still records it as coo_approved) → payment confirmation (Admin only)',
            ],
            access: 'View own: all staff　View all / batch calculation: HR / Admin (or staff with view_payroll)　Confirm / approve: staff with the matching approval permission',
          },
          {
            icon: DollarSign,
            href: '/payroll/annual',
            title: 'Annual Payroll Summary',
            desc: 'A year-at-a-glance summary of your pay across all 12 months. When you view your own annual record, there\'s no status filter — only RLS enforces access — so you can see every status (including draft / in review), unlike "My Payslips" which only shows approved / paid entries.',
            features: [
              'Pick a year (current year ± 2) to see your month-by-month breakdown and annual total',
              'Months without data show "—", meaning HR hasn\'t created that month\'s payroll yet',
              '[HR / Admin] Switch employees via a dropdown to view anyone\'s annual summary',
            ],
            access: 'View own: all staff　View others: HR / Admin',
          },
          {
            icon: BarChart3,
            href: '/admin/payroll/anomalies',
            title: 'Payroll Anomaly Scan',
            desc: 'Scans a chosen year/month\'s payroll records and flags 5 kinds of anomalies: overtime over 46 hours, net pay differing more than 20% from last month, unpaid-leave deductions exceeding half of base salary, new hires / departures that month, and full-time staff with a base salary of 0. There\'s no dedicated sidebar entry — the main way in is the embedded block on "Finance Settings."',
            features: [
              'Run a scan: clears that month\'s old flags and re-scans, writing new results back',
              'View flagged anomalies: reads existing flags only, without triggering a new scan',
              'This page can\'t edit payroll — only flag and view; fixes are made on the Payroll Table / detail page',
            ],
            access: 'Admin only (HR / Finance / COO with the matching permission)',
          },
          {
            icon: Landmark,
            href: '/admin/insurance-brackets',
            title: 'Insurance & Pension Brackets',
            desc: 'Upload and review the annual Labor / Health Insurance salary brackets and the Labor Pension monthly-contribution brackets (two separate sections on one page). If a year\'s brackets haven\'t been uploaded, the batch payroll calculation will compute premiums as 0 (the screen warns you, but it doesn\'t block the calculation).',
            features: [
              'Upload Labor / Health Insurance / Pension bracket tables (xlsx / xls / csv, auto-detects Chinese/English column names, with a preview and reasons for any skipped rows); a blank template is available to download',
              'Upload replaces the whole year\'s table (re-uploading the same year deletes the old table and writes the new one in a single transaction)',
              'Switch years to view existing bracket tables',
            ],
            access: 'View the page: Finance / COO / Admin　Actually upload: staff with finance-payroll permission / Admin (Finance / COO can see the form but get a 403 on upload)',
          },
          {
            icon: Gift,
            href: '/admin/bonuses',
            title: 'Bonus Management',
            desc: 'Create, view and delete bonus records (year-end / performance / project / other). Batch payroll calculation only pulls in bonuses whose year and month both match — a bonus left without a month is never included in any month\'s calculation.',
            features: [
              'Add a bonus record (employee / type / amount / optional month / description) — leaving the month blank means it\'s never picked up by batch calculation',
              'Delete a bonus record (requires confirmation, cannot be undone)',
              'Switch years to view that year\'s total bonus amount',
            ],
            access: 'Manage: staff with finance-payroll permission / Admin (HR sees the button but gets a 403 on click)',
          },
          {
            icon: GraduationCap,
            href: '/training',
            title: 'Training',
            desc: 'Assign training courses and manage personal certificate expiry.',
            features: [
              'Create and assign courses (with material links and required flags)',
              'Staff mark completion and upload a certificate; once marked complete, you can\'t change it back yourself — that requires a training manager',
              'Certificate registry with expiry tracking ("Expiring soon" within 30 days); you can add / edit only your own certificates, and deleting one requires a training manager',
              '[Training manager] Can add / edit / delete certificates on behalf of any employee, and check "All staff" to view everyone\'s certificates',
              '[Training manager] "Expiry reminders" tab lists company-wide certificates due within 60 days',
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
              'Managers score each goal plus an overall review (MFA required) → completion locks the result; even if the person being reviewed holds HR / Admin rights, they cannot approve or score their own review',
              'On completion, a KPI snapshot for the period is auto-saved to daily reports (target vs. actual)',
              'HR / Admin can view company-wide progress and reopen a completed review (MFA required)',
            ],
            access: 'Goals / self-assessment: self　Review: direct manager (HR / Admin can view company-wide)　Cycle management: HR / Admin',
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
              'Approval flow: Upload → Pending → Approved / Rejected → Archived (approval requires MFA, and you can\'t approve your own upload; INTERNAL documents are auto-approved on submission)',
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
            desc: 'Announcements are split into three tabs — "Unconfirmed," "All," and "Publish Report." Clicking a card always opens the document detail page (/documents/[id], not /announcements/[id]); the standalone announcement detail page has no links pointing to it and is effectively an orphan route.',
            features: [
              '"Unconfirmed" lists announcements you haven\'t confirmed reading yet; "All" can be filtered by category (Urgent / Admin / Regulation / HR) and keyword',
              'Important announcements require MFA before you can click "Confirm read"; unconfirmed ones show up as a dashboard reminder',
              '[Publishers] The "Publish Report" tab shows each announcement\'s confirmation status and can nudge unconfirmed staff via Teams with one click (4-hour cooldown)',
              '[Publishers] Export the read-confirmation list to Excel',
            ],
            access: 'View: all staff　Publish / publish reports / nudge: staff with announcement-publish permission',
          },
          {
            icon: FileSignature,
            href: '/contracts',
            title: 'Contracts',
            desc: 'View and manage the company\'s external contracts (NDA / MOU / Contract / Amendment). Regular staff can\'t see each other\'s contracts — only the uploader, the owner, or staff with approval permission can. Uploading, archiving and OCR happen on the same document\'s page under "Documents" — this detail page has no buttons for them.',
            features: [
              'Filter by company, status, type and keyword; expiry dates are color-coded (red for expired or due within 30 days, orange for 31–90 days)',
              'Approval flow: Pending → Approved / Rejected (approval requires MFA; you can\'t approve your own upload)',
              'Automatic expiry reminders: 90 and 30 days before expiry, via Teams to staff with approval permission (a background schedule, not a button)',
              'The applicant is notified automatically on approval or rejection; contract-type documents also notify the COO',
            ],
            access: 'View: Admin or staff with contract-approval permission see everything; everyone else sees only what they uploaded　Approve: staff with contract-approval permission (approve_contract) / Admin, MFA required',
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
            desc: 'Browse every project card in the company (visible to all staff), create projects, manage members, and track members\' overtime. The project detail page must be reached by typing its URL directly — the list page has no links into it yet.',
            features: [
              'Browse all project cards: name / description / lead / status / member count',
              '[Staff with project-creation permission] Create a project and assign a lead (a regular grantee can only set themselves as lead; Admin can assign anyone)',
              'Anyone who can see the project list can open "Member Management" to add people — this isn\'t currently restricted to the lead',
              'The detail page (URL only) shows project-related overtime requests; the COO is auto-notified when a project\'s overtime hours exceed a threshold',
            ],
            access: 'Browse: all staff　Create: staff with project-management permission　Detail page: Admin, the lead, or a member',
          },
        ],
      },
      {
        name: 'Procurement',
        modules: [
          {
            icon: ShoppingCart,
            href: '/procurement',
            title: 'Procurement Overview',
            desc: 'A complete overview of the procurement chain — Quote → Purchase Requisition → Goods Receipt → Stock In / Out → Payment — plus supplier, product and inventory management. Each document type is maintained on its own tab below; this page is just the aggregated entry point.',
            features: [
              'Document chain: Quote → Purchase Requisition → Goods Receipt → Stock In / Out → Payment',
              'Multi-stage approval engine (department manager / COO / CEO / accounting); approval requires MFA',
              'Barcode scanning (scanner / phone camera) auto-adjusts stock on stock-in / stock-out',
              'Approved goods receipts convert to assets in one click; voiding approved documents is restricted to staff with procurement-management permission and requires MFA',
            ],
            access: 'View: staff with procurement permission',
          },
          {
            icon: FileText,
            href: '/procurement/rfqs',
            title: 'Quotes (RFQ)',
            desc: 'The requester lists items and assigns someone to collect quotes; that person records multiple suppliers\' prices per item, checks off the one to "use," then sends it to the department manager for approval. Once approved, it converts to a Purchase Requisition in one click.',
            features: [
              'Create a draft and add items; record multiple suppliers\' quotes per item and check "use" (only one quote per item can be used); quote attachments can be uploaded',
              'The person collecting quotes can keep editing during approval (exempt from the usual lock); approval flow: quote-collector\'s stage → department manager\'s stage (both require MFA)',
              'If the department manager has no manager, or is themselves a manager, someone holding procurement_payment_approve approves in their place to avoid a stuck request',
              'After approval, "Convert to Purchase Requisition" auto-fills the items and their chosen unit prices',
              '[procurement_manage / admin + MFA] "Void & duplicate" an approved / rejected quote',
            ],
            access: 'View / create: staff with procurement permission',
          },
          {
            icon: ShoppingCart,
            href: '/procurement/purchase-requests',
            title: 'Purchase Requisitions',
            desc: 'Records what\'s being ordered from a supplier — items, amount, payment terms — and routes through "department manager → COO (total > 3,000) → CEO (total > 20,000) → notify procurement." Once approved, it converts to a Goods Receipt or a Deposit Payment.',
            features: [
              'Picking a supplier auto-fills their tax ID, contact and payment info; subtotal / tax / total are always recalculated server-side, overriding whatever the browser sent',
              'The total amount decides whether COO / CEO stages get added on submission (thresholds are adjustable in "COO Settings"); the "notify procurement" step always happens',
              'Once approved, converts to a "Goods Receipt" or a "Deposit Payment"',
              '[procurement_manage / admin + MFA] Void, or void & duplicate, only',
              'A given purchase requisition can have only one non-voided payment request at a time (since v1.0.4)',
            ],
            access: 'View / create: staff with procurement permission',
          },
          {
            icon: Package,
            href: '/procurement/goods-receipts',
            title: 'Goods Receipts',
            desc: 'Records inspection results, amount and invoice details for goods received from a supplier. After two-stage confirmation — the last editor, then any procurement staff — it converts to a Stock-In or Payment, or (asset managers only) straight into an asset.',
            features: [
              'Can pull in a source Purchase Requisition number; enter supplier / amount / invoice info, and upload invoices and shipping documents',
              'Check "deposit already paid" and enter the deposit payment\'s number and amount (auto-filled once that Deposit Payment is approved)',
              'Approval flow: last editor confirms → any procurement staff confirms (both require MFA)',
              '[asset_manage permission] "Convert to asset" after approval, in one click, into the Assets module',
              '[procurement_manage / admin + MFA] "Void & duplicate" — blocked if any non-voided downstream document exists, and it lists which ones',
            ],
            access: 'View / create: staff with procurement permission',
          },
          {
            icon: Building2,
            href: '/procurement/vendors',
            title: 'Vendors',
            desc: 'Maintains supplier basic / contact / billing / banking details, used to auto-fill Quotes, Purchase Requisitions and similar documents. There\'s currently no delete option in the UI.',
            features: [
              'Browse the vendor list (searchable, sortable, paginated); click a row to open a detail popup with the full record',
              '[procurement_manage / admin] Add / edit vendors (regular procurement_unit staff don\'t see this button)',
              'A path that doesn\'t need procurement_manage: submit a "Vendor Evaluation" for COO approval — once approved, it\'s written in automatically and gets a vendor number',
            ],
            access: 'View: staff with procurement permission　Add / edit: staff with procurement-management permission',
          },
          {
            icon: Package,
            href: '/procurement/products',
            title: 'Products',
            desc: 'Maintains product data and the dual-unit conversion setup ("purchase unit × conversion rate = stock unit"); you can also review each supplier\'s quote history for comparison.',
            features: [
              'Browse the product list, with dual-unit conversion and current stock shown in the table',
              'Click a row for a detail popup: spec / category / stock level, the dual-unit conversion formula, and the price-comparison history (supplier quotes are written in automatically once a Quote is approved — this page doesn\'t maintain them manually)',
              'Click a product name to open its "Stock Ledger" and see its movement history (view-only)',
              '[procurement_manage / admin] Add / edit / delete products',
            ],
            access: 'View: staff with procurement permission　Add / edit / delete: staff with procurement-management permission',
          },
          {
            icon: ClipboardList,
            href: '/procurement/evaluations',
            title: 'Vendor / Product Evaluations',
            desc: 'Two forms on one page (two tabs): one registers a new vendor\'s details through an approval flow, the other records a note about where a price comparison came from. Vendor evaluations write into the Vendor master automatically once approved. Product evaluations only record a source Quote number and a note — there\'s no line-item comparison editor here, and it doesn\'t record comparison results automatically.',
            features: [
              '"Vendor Evaluation": fill in vendor fields plus a note, submit for approval — always approved by the COO, and approval auto-writes the vendor into the master list with a new vendor number',
              '"Product Evaluation": fill in a source Quote number plus a note, submit for approval by your direct manager (or self-approved if you have none)',
              'The detail popup shows the approval timeline; when it\'s your turn, you can approve / reject (MFA required)',
            ],
            access: 'View / create: staff with procurement permission',
          },
          {
            icon: Package,
            href: '/procurement/inventory',
            title: 'Inventory (Stock In / Out / Lookup)',
            desc: 'Stock-In documents receive goods into the warehouse against a lot number; Stock-Out documents deduct stock (usage / consumption / disposal); "Stock Lookup" lets you scan an item or lot code with a scanner or phone camera for a quick current-quantity check. All three tabs share the same permission set.',
            features: [
              'Create a Stock-In / Stock-Out draft (fill it in by hand, or scan to auto-fill / accumulate a lot); approval is a single stage where the creator confirming it counts as approval (MFA still required)',
              'Posting: Stock-In writes into lot inventory and the ledger (total received against one goods receipt can\'t exceed the receipted quantity); Stock-Out deducts stock (blocked if insufficient)',
              'Reverse posting: reverses an already-posted document; blocked if that lot has already been consumed by a later Stock-Out',
              'Approved documents can\'t be deleted or voided — only reverse-posted, or handled by an admin',
              '[procurement_manage / admin] Can edit / delete anyone\'s draft and reverse-post on their behalf; "Stock Lookup" is view-only with no write actions',
            ],
            access: 'View / operate: staff with procurement permission',
          },
          {
            icon: Receipt,
            href: '/procurement/payments',
            title: 'Payments (Deposit / Payable / Installment)',
            desc: 'A Deposit Payment is usually generated from a Purchase Requisition; a Payable Payment is usually generated from an approved Goods Receipt; an Installment Payment can only be generated one at a time, from "Create Installment" on a Payable Payment\'s detail page. None of the three have a delete or void button.',
            features: [
              'Generated as a draft from its source document (bank details auto-filled), or created directly by hand; a given purchase requisition can have only one non-voided Payable Payment (since v1.0.4)',
              'Edit amount / remittance deadline / bank details, then submit (a single accounting stage)',
              '[job_role=finance or admin + MFA] Approve / reject; the creator can\'t approve their own submission (separation of duties)',
              'Once a Payable Payment is marked for installments and approved, you can click "Create Installment" repeatedly to generate each installment (auto-numbered)',
              'Once a Deposit Payment is approved, its matching Goods Receipt auto-fills the deposit-paid information',
            ],
            access: 'View / create: staff with procurement permission　Approve: Finance or Admin',
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
              '"Expiry reminders" tab lists calibration / maintenance items due within 60 days or already overdue — visible to everyone (disposed assets are excluded)',
              'Can convert an approved procurement Goods Receipt into an asset in one click (a given receipt can only be converted once, to avoid double-counting its value in the register)',
            ],
            access: 'View: all staff (read-only)　Changes: staff with asset-management permission',
          },
          {
            icon: FlaskConical,
            href: '/lab',
            title: 'Lab Supplies',
            desc: 'Batch-lot, expiry and usage management for reagents and consumables. All staff can view items / batches / expiry reminders, but the detailed "change history" is visible to managers only.',
            features: [
              'Search the item list by keyword / category and expand any item to see all its batches (lot number / expiry / quantity); switch to "Expiry reminders" for batches due within 60 days',
              '[lab_manage permission or admin] Add / edit / delete items; receive a new batch (lot number / expiry / quantity)',
              '[lab_manage permission or admin] Run "use" / "open" / "dispose" on a batch (stock deduction is an atomic transaction)',
              '[lab_manage permission or admin only — regular staff can\'t see this] View a batch\'s full change history (who did what, and when)',
            ],
            access: 'View (excludes change history): all staff　Changes & change history: staff with lab-supplies-management permission',
          },
        ],
      },
      {
        name: 'Other',
        modules: [
          {
            icon: MessageSquarePlus,
            href: '/feedback',
            title: 'Feedback',
            desc: 'See the history and status of feedback you\'ve submitted, and add follow-up comments in the thread. Submissions are named — visible only to Admin, not anonymous.',
            features: [
              'View everything you\'ve submitted (type / status / submitted time / attached image)',
              '"New feedback" opens the submission form: choose a type (feature request / bug report), enter a title and description, optionally attach one screenshot',
              'Reply to Admin in the comment thread; adding a comment to an item already marked "Done" or "Returned" automatically reopens it as "Pending"',
              'This page only shows your own feedback; Admin reviews company-wide feedback and changes status under "Feedback Management"',
            ],
            access: 'View: only your own feedback',
          },
          {
            icon: Settings,
            href: '/settings',
            title: 'Settings',
            desc: 'Manage your personal preferences — each user can only view / change their own settings (a different page from the Admin-only "System Settings").',
            features: [
              'Change your display name',
              'Switch interface language (Traditional Chinese / English / Japanese)',
              'Toggle dark / light mode',
              'Manage Two-Factor Authentication (MFA): you can reset it yourself; you\'ll need to scan a new QR code next time you log in',
            ],
          },
        ],
      },
      {
        name: 'HR Administration (Management)',
        modules: [
          {
            icon: UsersRound,
            href: '/admin/users',
            title: 'User Management',
            desc: 'The company-wide account list — adjust department, system role, job role and employment info, and deactivate accounts for departed staff. Accounts can\'t be created here; they\'re always created automatically the first time someone logs in via Entra.',
            features: [
              'Edit department / employment type / work location / direct manager / delegate approver / active status',
              '[Admin only] Edit system role, job role (hr_manager / finance / coo / ceo) and individual permission flags',
              '[Admin only] Deactivating a user shows an "Offboarding Handover Check" first (open contracts / active projects / pending requests / unpaid payroll); non-Admin HR can only change status via the "Edit" dialog and don\'t see this handover warning',
              '[Admin only] Clicking the HR-profile icon opens salary and personal-data editing (HR clicking it is redirected to a no-permission page)',
            ],
            access: 'View / partial edit: HR (requires individual permission — job_role alone isn\'t enough) / Admin　Full edit (roles / deactivating admins): Admin only',
          },
          {
            icon: Building2,
            href: '/admin/departments',
            title: 'Department Management',
            desc: 'Maintains the department list (code + name), used as the dropdown source in User Management, Recruiting, Approvals and similar modules. Only create and edit are supported — there\'s no delete.',
            features: [
              'Add a department (name + code, up to 10 characters, auto-uppercased)',
              'Edit an existing department\'s name / code',
            ],
            access: 'Admin only (HR cannot access this page at all)',
          },
          {
            icon: Building2,
            href: '/admin/companies',
            title: 'Companies',
            desc: 'Maintains the "partner company" master list (name + a list of aliases), used to pick a company in Contracts and Documents. "Company" here means an external counterparty, not myOPS\'s own legal entities.',
            features: [
              'Search existing companies (by name or alias)',
              'Add a company (name + comma-separated aliases)',
              'Edit an existing company\'s name / aliases (no delete option)',
            ],
            access: 'Admin only',
          },
          {
            icon: LogOut,
            href: '/admin/lifecycle',
            title: 'Onboarding / Offboarding',
            desc: 'HR tracks a handover checklist for every new hire / departing employee (default templates: 10 items for onboarding, 8 for offboarding). Non-Admin HR currently has no sidebar link to this page — you need to know the URL. The feature is off by default and needs Admin to turn it on first.',
            features: [
              'Pick a person and a type (onboarding / offboarding) to create a checklist that auto-expands from the default template',
              'Check off items one by one (timestamped), add notes, and add custom items',
              'Checking everything marks the whole list "Complete"; unchecking any item automatically reverts it to "In progress"',
            ],
            access: 'HR (individual permission) / Admin (HR has no sidebar entry — you need to know the URL)',
          },
          {
            icon: UserPlus,
            href: '/admin/recruiting',
            title: 'Recruiting',
            desc: 'Manage job openings and candidates (Applied → Screening → Interview → Offer → Hired / Rejected). Same as above — no sidebar entry for non-Admin HR, and the feature is off by default. Only HR / Admin can download resumes.',
            features: [
              'Create / edit / close job openings (title, department, requirements, headcount)',
              'Add a candidate and upload their resume; drag between stages: Applied → Screening → Interview → Offer → Hired / Rejected',
              'Add an interview record (date, 1–5 star rating, written feedback)',
            ],
            access: 'HR (individual permission) / Admin (HR has no sidebar entry — you need to know the URL)',
          },
          {
            icon: UsersRound,
            href: '/admin/hr-settings',
            title: 'HR Settings',
            desc: 'A consolidated HR settings page embedding attendance / overtime parameters, leave-type management, overtime rates, a read-only attendance-anomaly list, and annual bonus records. HR access here is judged by job_role — a different mechanism from the granted_features check used by User Management, Onboarding/Offboarding, and Recruiting.',
            features: [
              'Edit attendance / overtime system parameters (default clock-in/out times, missed-clock reminder days, etc.)',
              'Leave-type management and overtime-rate management blocks (same functionality as their standalone pages)',
              'View the attendance-anomaly list (auto-fill anomalies in the last 30 days, interns who missed clocking in this month)',
              'Manage annual bonus records; every block on this page is read-only for COO (shown with a lock icon)',
            ],
            access: 'View: HR / COO / Admin　Edit: HR (job_role) / Admin',
          },
        ],
      },
      {
        name: 'System Administration',
        modules: [
          {
            icon: Settings,
            href: '/admin/settings',
            title: 'System Settings',
            desc: 'Site-wide settings — feature module toggles, AI connection (provider / API key / model / embeddings), and attendance / notification / system parameters. Unlike Finance Settings and COO Settings, this page has no read-only view for other job roles.',
            features: [
              'Toggle each module on / off (attendance, leave, payroll, documents, procurement, etc.); once off, regular staff can\'t see or use that module at all',
              'AI connection settings: choose a provider, enter an API key / model, and verify instantly with "Test connection"',
              'Embedding settings: enable vector search for policy Q&A; switching models requires clicking "Rebuild document index" to reprocess everything',
              'Sensitive values (API keys, the Teams bot secret) are never sent to the browser — the screen only shows "Configured / Not configured"',
            ],
            access: 'Admin only (HR / Finance / COO can\'t access this page at all, not even read-only)',
          },
          {
            icon: Landmark,
            href: '/admin/finance-settings',
            title: 'Finance Settings',
            desc: 'A management entry point for payroll-related system parameters (pay date, etc.), the Labor / Health Insurance and Pension bracket tables, and the payroll anomaly scan (shares the same components as their standalone pages).',
            features: [
              'Edit the "pay date" and "payroll auto-generation date"',
              'Manage all three bracket tables — Labor Insurance, Health Insurance, and Labor Pension monthly contribution',
              'Run the payroll anomaly scan',
            ],
            access: 'View (read-only): COO / Admin　Edit: Finance / Admin (HR has no access to this page)',
          },
          {
            icon: ShieldCheck,
            href: '/admin/coo-settings',
            title: 'COO Settings',
            desc: 'Operational policy parameters — the Teams notification threshold for project overtime, contract expiry reminder days, and the amount-based approval thresholds for Purchase Requisitions.',
            features: [
              'Set the "project overtime COO threshold (hours)": exceeding it notifies all active COOs via Teams (a plain reminder, not an extra approval stage)',
              'Set the first and second contract-expiry reminder days',
              'Set the amount thresholds that add COO / CEO approval stages to Purchase Requisitions; the draft page previews which stages a requisition will go through in real time',
            ],
            access: 'View (read-only): HR / Admin　Edit: COO / Admin (Finance has no access to this page)',
          },
          {
            icon: Bot,
            href: '/admin/bot-policy',
            title: 'Teams One-Tap Approval Policy',
            desc: 'Controls, document type by document type, whether each of the 10 procurement document types uses a "deep link" or "one-tap approval" on its Teams card. Everything is off by default (deep link + MFA, the safest mode) — turning it on trades away MFA protection for speed.',
            features: [
              'Toggle Teams one-tap approval individually for each of the 10 procurement document types (all off by default)',
              'For document types with an amount field, set a one-tap threshold — at or above it, the card still forces a deep link + MFA',
              'Changes take effect on the next new notification; cards already sent aren\'t retroactively revoked, but approval always re-checks the current policy, so an old card can\'t slip past a policy that\'s since been tightened',
              'This setting only covers the 10 procurement document types; Teams notifications for leave / overtime / expenses and other approvals are always plain text + deep link',
            ],
            access: 'Admin only',
          },
          {
            icon: ScrollText,
            href: '/admin/audit',
            title: 'Audit Log',
            desc: 'A site-wide audit-log search page — search and filter document-related audit events (upload / approve / reject / read-confirmation / archive / OCR, etc.). The "related document" field is plain text, not a clickable link.',
            features: [
              'Search action types by keyword, or filter to a single action type via a dropdown',
              'Browse 50 records per page (time / actor / action / related document title / notes)',
            ],
            access: 'Admin / HR (regular staff only see the audit sidebar on documents they have access to)',
          },
          {
            icon: MessageSquarePlus,
            href: '/admin/feedback',
            title: 'Feedback Management',
            desc: 'The company-wide feedback management list — view everyone\'s submissions, filter, change status, and reply to submitters in the comment thread.',
            features: [
              'Filter by status (Pending / In progress / Done / Returned) and type',
              'Change a single feedback item\'s status via a dropdown',
              'Open the detail view to see the full description and attached image, and reply to the submitter; if the submitter adds a comment to an item marked "Done" or "Returned," it automatically reopens as "Pending"',
            ],
            access: 'Admin only (HR cannot access this either)',
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
          { feature: 'Leave Calendar /leave/calendar', employee: '△', manager: '△', hr: true, admin: true, note: 'Orphan page; regular staff / managers see only their own department' },
          { feature: 'Insights dashboard', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: 'Attendance',
        rows: [
          { feature: 'Clock in / out', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Apply for missed clock', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Approve missed clock', employee: false, manager: true, hr: true, admin: true },
          { feature: 'View & void all staff attendance', employee: false, manager: false, hr: true, admin: true, note: 'HR here is judged by job_role, unlike other pages' },
          { feature: 'Geofences /admin/geofences', employee: false, manager: false, hr: false, admin: true, note: 'The only page restricted to admin only' },
          { feature: 'Shift Management /admin/shifts', employee: false, manager: false, hr: '△', admin: true, note: 'Excludes COO, unlike the other 3 pages' },
          { feature: 'Attendance Anomalies /admin/attendance-anomalies', employee: false, manager: false, hr: '△', admin: true, note: 'job_role only — individual grants don\'t apply' },
        ],
      },
      {
        name: 'Leave / Overtime',
        rows: [
          { feature: 'Apply for leave', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Approve leave', employee: false, manager: true, hr: true, admin: true, note: 'HR here is not judged by job_role, unlike Attendance' },
          { feature: 'Revoke approved leave', employee: '△', manager: false, hr: true, admin: true, note: 'Before it starts you can cancel it yourself; once started, only HR/admin' },
          { feature: 'Leave Types / Leave Balances', employee: false, manager: false, hr: '△', admin: true, note: 'job_role only — individual grants don\'t apply' },
          { feature: 'Apply for overtime', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Approve overtime', employee: false, manager: true, hr: false, admin: true, note: 'HR cannot approve — only manager / project lead / admin' },
        ],
      },
      {
        name: 'Business Trips',
        rows: [
          { feature: 'Apply for a trip', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Approve a trip', employee: false, manager: true, hr: true, admin: true, note: 'The approver is fixed as the manager at time of submission' },
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
          { feature: 'View all payroll / batch calculation', employee: false, manager: false, hr: true, admin: true, note: 'Batch calculation is a manual button, not scheduled' },
          { feature: 'Confirm / approve payroll', employee: false, manager: false, hr: false, admin: '△', note: 'Requires confirm/approve_payroll permission' },
          { feature: 'Annual payroll summary (view others)', employee: false, manager: false, hr: true, admin: true, note: 'Requires view_payroll permission' },
          { feature: 'Payroll anomaly scan /admin/payroll/anomalies', employee: false, manager: false, hr: '△', admin: true, note: 'Requires finance-payroll-related permission' },
          { feature: 'Insurance / pension bracket upload', employee: false, manager: false, hr: '△', admin: true, note: 'Requires finance_payroll; Finance/COO can only view the form' },
          { feature: 'Bonus Management /admin/bonuses', employee: false, manager: false, hr: '△', admin: true, note: 'Requires finance_payroll; HR sees the button but gets a 403' },
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
          { feature: 'Procurement work / create documents (Quote / PR / Goods Receipt)', employee: false, manager: '△', hr: false, admin: '△', note: 'Requires procurement permission, not tied to role' },
          { feature: 'Procurement approval (dept. manager → COO → CEO)', employee: false, manager: '△', hr: false, admin: '△', note: 'Thresholds adjustable in COO Settings' },
          { feature: 'Stock-in / stock-out approval', employee: false, manager: '△', hr: false, admin: '△', note: 'Creator self-confirms; MFA required' },
          { feature: 'Payment approval (deposit / payable / installment)', employee: false, manager: false, hr: false, admin: '△', note: 'Requires finance role; can\'t approve your own request' },
          { feature: 'Add / edit vendor / product master data', employee: false, manager: '△', hr: false, admin: '△', note: 'Requires procurement-management permission, or via vendor evaluation auto-write' },
          { feature: 'Convert to asset (goods receipt → asset)', employee: false, manager: '△', hr: false, admin: '△', note: 'Requires asset_manage permission; convertible only once' },
          { feature: 'Void an approved document', employee: false, manager: false, hr: false, admin: '△', note: 'Only RFQ/PR/GR have a void option; MFA required' },
        ],
      },
      {
        name: 'Teams One-Tap Approval',
        rows: [
          { feature: 'Teams one-tap approval policy /admin/bot-policy', employee: false, manager: false, hr: false, admin: true, note: 'Admin only; everything off by default (deep link + MFA)' },
          { feature: 'Teams one-tap approve / reject card', employee: '△', manager: '△', hr: '△', admin: '△', note: 'Only 10 procurement document types; everything else is deep link + MFA' },
          { feature: 'Teams text-command lookup', employee: true, manager: true, hr: true, admin: true, note: 'Only replies with your own data; AI fallback requires a separate toggle' },
        ],
      },
      {
        name: 'Assets / Lab Supplies',
        rows: [
          { feature: 'View assets / stock / expiry reminders', employee: true, manager: true, hr: true, admin: true },
          { feature: 'Manage asset changes', employee: false, manager: '△', hr: '△', admin: '△', note: 'Requires asset_manage permission' },
          { feature: 'Lab supplies — change history / management', employee: false, manager: '△', hr: '△', admin: '△', note: 'Viewing is open to all; change history is management-only' },
        ],
      },
      {
        name: 'Projects / Other',
        rows: [
          { feature: 'Browse project list', employee: true, manager: true, hr: true, admin: true, note: 'Visible to everyone, not filtered by membership' },
          { feature: 'Create projects / assign a lead', employee: false, manager: false, hr: false, admin: true, note: 'Requires manage_projects permission' },
          { feature: 'Project member management', employee: true, manager: true, hr: true, admin: true, note: 'Not currently restricted to the lead' },
          { feature: 'Submit feedback (named)', employee: true, manager: true, hr: true, admin: true },
          { feature: 'View feedback', employee: false, manager: false, hr: false, admin: true },
          { feature: 'Admin panel', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: 'HR Administration (Management)',
        rows: [
          { feature: 'User Management /admin/users', employee: false, manager: false, hr: '△', admin: true, note: 'Requires individual permission (job_role alone isn\'t enough)' },
          { feature: 'User HR Profile /admin/users/[id]/profile', employee: false, manager: false, hr: false, admin: true, note: 'Most restricted: not even HR, not even the user themselves' },
          { feature: 'Department Management / Companies', employee: false, manager: false, hr: false, admin: true, note: 'Admin only — HR cannot access either' },
          { feature: 'Onboarding / Offboarding /admin/lifecycle', employee: false, manager: false, hr: '△', admin: true, note: 'Requires individual permission, and has no sidebar entry' },
          { feature: 'Recruiting /admin/recruiting', employee: false, manager: false, hr: '△', admin: true, note: 'Same as above; off by default, resumes limited to HR/admin' },
          { feature: 'HR Settings /admin/hr-settings', employee: false, manager: false, hr: '△', admin: true, note: 'HR needs job_role to edit; COO is read-only' },
        ],
      },
      {
        name: 'System Administration',
        rows: [
          { feature: 'System Settings /admin/settings', employee: false, manager: false, hr: false, admin: true, note: 'Not even read-only for other roles' },
          { feature: 'Finance Settings /admin/finance-settings', employee: false, manager: false, hr: false, admin: true, note: 'COO read-only; Finance can edit; HR has no access' },
          { feature: 'COO Settings /admin/coo-settings', employee: false, manager: false, hr: '△', admin: true, note: 'HR read-only; COO can edit; Finance has no access' },
          { feature: 'Audit Log /admin/audit', employee: false, manager: false, hr: true, admin: true, note: 'Admin/HR see the whole site; staff limited to a single document' },
          { feature: 'Feedback Management /admin/feedback', employee: false, manager: false, hr: false, admin: true, note: 'Admin only — HR cannot access either' },
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
            desc: 'ログイン後のホーム画面です。本日の業務状況をすぐに確認できます。',
            features: [
              '未読のお知らせ件数を表示',
              '承認待ちの休暇・残業・経費精算などの件数リマインダー',
              '本日の打刻状況',
              'クイックアクション：打刻、休暇申請、残業申請',
              '証明書・校正/保守の期限接近カード（該当する管理権限がある場合のみ表示）',
            ],
          },
          {
            icon: CheckSquare,
            href: '/approvals',
            title: '承認センター',
            desc: '承認待ちの申請を1ページに集約し、ページを巡らずに承認・却下できます。承認・却下は各機能モジュール本来のAPIを直接呼び出すだけで、本ページは集約入口であり別の承認システムではありません。',
            features: [
              '集約対象：休暇、残業、打刻漏れ、経費精算、文書 / 契約、給与、購買、出張',
              'ワンタップで承認または却下（却下は理由入力が必須）',
              '申請者・種別・日付・金額を表示',
              '金額を伴う書類や重要操作はMFA認証が必要',
              'Teamsでのワンタップ承認は購買関連10種類の書類のみ対応（管理者ポリシーによる）。それ以外（休暇 / 残業 / 経費精算 / 文書契約 / 給与）のTeams通知は常にテキストのみで、リンクからWebページを開いてMFA認証が必要',
            ],
            access: '承認：各申請種別の承認権限に準拠',
          },
          {
            icon: CalendarRange,
            href: '/calendar',
            title: 'カレンダー',
            desc: '会社イベント・承認済み休暇・出張を1ページの月間カレンダーに集約し、会社イベントにRSVPできます。',
            features: [
              '会社イベント（緑）、同僚の休暇中（青）、承認済み出張（紫・目的地を表示）',
              '日付をクリックしてその日の全リストを表示。会社イベントには参加 / 不参加 / 未定でRSVP可能',
              '休暇は「休暇中」のみ表示し休暇種別は表示しません（v0.9.9より健康関連の個人情報保護のため意図的に非表示）。休暇種別を確認する場合は「休暇カレンダー」をご利用ください（同部門 / HRは種別を閲覧可能。上司のシフト調整用）',
              'HR / 管理者は会社イベントの新規作成 / 編集 / 削除が可能',
              '休暇 / 出張の承認後、本人のOutlookに終日「不在」予定を自動作成（片方向同期・初回は再ログインでの認可が必要）',
            ],
            access: '閲覧：全従業員　イベント管理：HR / 管理者',
          },
          {
            icon: BarChart3,
            href: '/insights',
            title: '経営ダッシュボード',
            desc: '全社の運営指標を集約・分析します（管理者限定）。',
            features: [
              '当月の出勤・残業サマリー、年間の休暇・経費精算合計',
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
            desc: 'myOPS上で日々の行程とKPIを直接入力できます。行程項目の丸をタップして完了をマークすれば、それが完了報告になります。',
            features: [
              '本日の行程 / KPI の2つのタブ（完了報告は行程の完了チェックに統合済み）',
              'よく使うテンプレートをワンタップで適用',
              '「今日」は台北時間で計算。タイムゾーンが異なっても日付がずれません',
              'KPIの空欄を誤って0として保存しません',
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
            desc: 'グループ単位でメンバーの当日の行程と完了状況を確認できます。グループ責任者（Viewer）はさらにKPIを閲覧し、指標を管理できます。',
            features: [
              '同じグループの一般メンバー同士も互いの行程と完了状況を閲覧可能（KPIは含みません。メンバー間で進捗を把握し合えるよう意図的に設計）',
              'グループ責任者（Viewer）はメンバーごとのKPI数値も追加で確認可能',
              '【Viewer / 管理者】KPI指標管理：指標の新規作成 / 編集 / 無効化（復元可）/ 完全削除',
              '管理者は任意のグループに切り替えて閲覧可能',
            ],
            access: '閲覧：同グループのメンバー（KPIを除く）　KPI・指標管理：グループ責任者（Viewer）/ 管理者',
          },
          {
            icon: UsersRound,
            href: '/admin/daily-report/groups',
            title: '日報グループ管理',
            desc: '日報グループを作成し、メンバーと閲覧者（上司）を割り当てます。日報機能全体を有効にする最初のステップです。',
            features: [
              'グループの新規作成 / 編集 / 削除（名称・説明）',
              'メンバーを追加し役割を指定：member（入力者）または viewer（閲覧者 / 上司）',
              '事前にシステム設定で「日報」機能を有効化し、グループを作成してメンバーを割り当てる必要があります。それまでメンバーは「日報入力」に何も表示されません',
            ],
            access: '管理者限定',
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
            desc: '出退勤の打刻と個人の記録確認ができます。HR / 管理者は同ページの「全員記録」タブで全社の記録を確認し、異常な記録を無効化できます。旧ルート /admin/attendance は現在リダイレクトのみで、独立したページではありません。',
            features: [
              'ワンタップで出勤 / 退勤打刻（GPS含む。管理者が「打刻範囲の強制」を有効にしている場合、ジオフェンス内でのみ成功）',
              '「マイ記録」で年 / 月別に打刻履歴と勤務時間を確認',
              '打刻漏れ申請（理由入力必須）。承認者はシステムが自動指定（通常は上司）、承認にはMFAが必要',
              'フレックスシフト：遅刻は当日のシフト開始時刻で判定（未割当は既定シフトを適用）',
              '【HR / 管理者】「全員記録」は月 / 従業員 / 雇用形態で絞り込み、異常な記録を無効化（理由入力必須）/ 無効化の取消が可能。いずれもMFAが必要',
            ],
            access: '打刻：全従業員　全員記録の確認・無効化：HR / 管理者（HR判定にjob_roleを含む。休暇 / 残業 / 出張とは異なる）',
          },
          {
            icon: MapPin,
            href: '/admin/geofences',
            title: '打刻範囲設定',
            desc: '打刻を許可するオフィスの地理座標範囲（複数地点可）を設定し、「範囲チェックの強制」をオン/オフできます。勤怠関連ページの中で唯一 role=admin のみに限定されており、HRはどの権限を持っていても入れません。',
            features: [
              '「打刻範囲チェックの強制」をオン/オフ（既定はオフ。座標は記録されますが打刻は阻止されません）',
              'ジオフェンスの新規作成（名称 / 緯度経度または現在地 / 半径）',
              'ジオフェンスの有効化 / 無効化 / 削除。複数設定可能で、いずれか1つの範囲内であれば打刻可能',
            ],
            access: '管理者限定（HR / COOともに利用不可）',
          },
          {
            icon: Clock,
            href: '/admin/shifts',
            title: 'シフト管理',
            desc: '複数の出退勤シフトを定義し、従業員に割り当てます。遅刻判定は従業員がその日所属するシフトの開始時刻に基づいて計算されます。',
            features: [
              'シフトの新規作成 / 編集（名称、出退勤時刻、勤務日、フレックス許容時間、休憩分数、有効状態）',
              '従業員ごとに現在適用するシフトを割り当て（有効なシフトのみ一覧表示）',
            ],
            access: '管理：HR / 管理者（COOは対象外。休暇種別管理 / 休暇残高 / 勤怠異常とは異なります）',
          },
          {
            icon: BarChart3,
            href: '/admin/attendance-anomalies',
            title: '勤怠異常',
            desc: '読み取り専用のレポートです。直近30日間に3日以上連続で自動補完打刻（打刻忘れ）が発生した正社員の一覧、および今月3回を超えて打刻漏れがあったインターンの一覧を表示します。',
            features: [
              '「正社員の連続自動補完」一覧（5日以上は赤色で表示）',
              '「インターンの打刻漏れ」一覧',
              'データ表示のみで、エクスポートや対応済みマークの機能はありません',
            ],
            access: '閲覧：HR（job_roleのみで判定）/ COO / 管理者（個別権限付与は対象外）',
          },
          {
            icon: CalendarDays,
            href: '/leave',
            title: '休暇',
            desc: '各種休暇を申請し、残日数と取得履歴を確認できます。HR / 管理者は全員の記録を確認し、承認済みの休暇を代理で撤回できます。',
            features: [
              '複数の休暇種別に対応（年次休暇、病気休暇、私用休暇、特別休暇など）。特別休暇は入社周年制、その他は暦年制',
              '利用可能な残日数を確認可能。特殊休暇（結婚 / 忌引 / 産休など）は先に「特殊休暇申請」を提出し、HRが承認した日数がなければ正式に申請できません',
              '承認フロー：提出 → 上司 / HR / 管理者が承認または却下（却下は理由入力必須、承認にはMFAが必要）',
              '開始前の承認済み休暇は自分で撤回可能。開始後の休暇はHR / 管理者のみが代理で撤回できます',
              '承認後、Outlookに終日「不在」予定を自動作成。却下 / 撤回時は自動的に削除されます（初回は再ログインでの認可が必要）',
            ],
            access: '申請：全従業員　承認：直属の上司 / HR / 管理者　全員記録の確認・代理撤回：HR / 管理者（本ページのHR判定はjob_roleを含みません。出退勤ページとは異なります）',
          },
          {
            icon: CalendarRange,
            href: '/leave/calendar',
            title: '休暇カレンダー',
            desc: '部門または全社の休暇状況（休暇種別・理由を含む）を月間カレンダーで確認でき、上司のシフト調整に役立ちます。現在アプリ内のどこからもこのページへのリンクはなく、URLを直接入力してアクセスする必要がある「孤立ページ」です。',
            features: [
              '月間カレンダーでその月の日ごとの休暇取得者数を表示（承認済み＝緑点、承認待ち＝黄点）',
              '日付をクリックしてその日の休暇一覧を絞り込み（氏名 / 休暇種別 / 期間 / 日数 / 状態）',
              '一般従業員は同部門のみ閲覧可能。HR / 管理者は部門ドロップダウンで任意の部門または全社を切り替えて閲覧可能',
              '読み取り専用。/calendar とは意図的に役割分担されており、本ページは休暇種別を表示します（同部門 / HRのシフト調整用）。/calendar はv0.9.9より休暇種別を意図的に非表示にしています',
            ],
            access: '閲覧：全従業員（一般従業員は同部門のみ）　全社閲覧：HR / 管理者',
          },
          {
            icon: CalendarDays,
            href: '/admin/leave-types',
            title: '休暇種別管理',
            desc: '会社の休暇種別一覧（名称 / 対象者 / 給与形態 / 年間上限 / 事前申請必要日数 / 有効状態）を管理します。「休暇」ページの申請ドロップダウンのデータ元です。本ページには読み取り専用モードがなく、COOも完全に編集できます。',
            features: [
              '休暇種別の新規作成（名称 / 対象者 / 給与形態 / 年間上限 / 事前申請日数 / 有効状態）',
              '既存の休暇種別項目を編集。保存後すぐに反映されます',
              'HRの事前資格審査が必要かどうかを制御するUIは現時点でなく、バックエンドで直接設定する必要があります',
            ],
            access: '管理：HR（job_roleのみ）/ COO / 管理者',
          },
          {
            icon: ListChecks,
            href: '/admin/leave-balances',
            title: '休暇残高管理',
            desc: '従業員ごと・休暇種別ごとに当年度（または特別休暇の周年制期間）の付与日数を調整します。従業員が「休暇」ページで見る残日数のデータ元です。v0.9.7よりサイドバーの唯一の管理入口となっており、こちらも読み取り専用モードはありません。',
            features: [
              '従業員 / 休暇種別ごとに当年度の付与日数を調整（表形式で入力）',
              '「勤続年数に応じて自動入力」で特別休暇の残高を一括生成 / 更新（手動調整済みのデータは上書きしません）',
              '従業員ドロップダウンで1名に絞り込み。各休暇種別の使用済み日数を確認可能',
            ],
            access: '管理：HR（job_roleのみ）/ COO / 管理者',
          },
          {
            icon: Timer,
            href: '/overtime',
            title: '残業',
            desc: '残業時間を申請します。残業代は労働基準法に基づき段階的に計算されます。HR / 管理者は全員の記録を確認できますが、HRは残業を承認できません。',
            features: [
              '残業日・時間帯（開始〜終了）・説明を入力。日区分（勤務日 / 休息日 / 国定休日）は日付から自動判定',
              '特定のプロジェクトに紐付け可能',
              '「承認待ち」タブは全社の承認待ち申請をログイン中の全従業員に表示しますが、承認ボタンは直属の上司 / プロジェクト責任者 / 管理者 / coo_notify権限保持者以外は必ず403エラーになります（閲覧できることと承認できることは別で、権限漏れではありません）',
              'HR（granted_featuresにhr_managerを含む）は残業を一切承認できず、「全員記録」の閲覧のみ可能',
              '承認済みの残業は労働基準法§24/§39に基づき段階計算（勤務日・休息日・国定休日で倍率が異なる）され、給与草稿に反映されます。MFAが必要',
            ],
            access: '申請：全従業員　承認：直属の上司 / プロジェクト責任者 / 管理者（HRは残業を承認できません）　全員記録：HR / 管理者',
          },
          {
            icon: Plane,
            href: '/business-trips',
            title: '出張管理',
            desc: '出張の申請と行程管理を行い、承認後にOutlookへ同期します。承認者は提出時点の直属の上司に自動的に固定され、その後上司が変わっても当該申請の承認者は変わりません。',
            features: [
              '目的地・事由・行程を入力 → 提出時点の直属の上司が承認（MFAが必要）',
              '申請者は承認待ちの申請をキャンセル可能',
              '承認センターに統合され、ワンタップで承認 / 却下可能',
              '承認済み出張は経費精算フォームに一括反映可能（カテゴリと事由が自動入力）',
              '承認後、Outlookに終日「不在」予定を自動作成。却下時は自動的に削除されます（初回は再ログインでの認可が必要）',
            ],
            access: '申請：全従業員　承認：提出時点の直属の上司 / HR / 管理者　全員記録：HR / 管理者',
          },
          {
            icon: Receipt,
            href: '/expenses',
            title: '経費精算',
            desc: '立替経費をオンラインで申請・承認・支払します。v0.10.2より会計科目による分類に変更されました。現時点では台湾ドルのみ対応しています。',
            features: [
              '会計科目のカテゴリを選択し、費用発生日 / 申請月、請求書番号、事由、金額（TWD）を入力',
              '請求書 / 受領証の写真またはPDFをアップロード（複数可）',
              '提出後、承認権限を持つ者が承認・却下・支払済みマークを実行（3つの操作すべてMFAが必要で、自分が提出した申請は承認できません）',
              '承認待ちの間は自分でキャンセル可能（状態が「取消済み」に変わるだけで削除ではなく、MFAは不要）',
              '承認済み出張と紐付けて一括反映可能。経費承認権限者はExcelで明細をエクスポート可能',
            ],
            access: '申請：全従業員　承認・支払と全員記録：経費承認権限を持つ従業員',
          },
          {
            icon: DollarSign,
            href: '/payroll',
            title: '給与',
            desc: '一般従業員は「マイ給与明細」のみ閲覧可能（人事長が承認済み、または支払済みの状態のみ）。HR / 財務 / 閲覧権限保持者はさらに「給与テーブル」タブがあり、バッチ計算・手動作成・一括承認が可能です。バッチ計算は手動ボタンで実行し、現在スケジュール自動生成はありません。',
            features: [
              '「マイ給与明細」で直近12ヶ月の承認済み / 支払済み給与明細の概要を確認。明細には支給額 / 控除額 / 実支給額 / 雇用主負担分と承認履歴を含みます',
              '【HR / 管理者】バッチ計算：月給 / 承認済み残業 / 無給休暇の控除 / 賞与 / 労健保等級表に基づいて当月の給与草稿を生成（再計算は承認フロー中の明細を上書きし承認履歴をクリアします。実行前に影響件数を警告表示）',
              '【HR / 管理者】一括承認：同じ承認段階の給与明細をまとめて次段階へ進めます。内部では1件ごとにMFAと状態を個別にチェックします',
              '給与は4段階の承認：HR審査 → 財務確認（confirm_payroll権限が必要）→ 人事長承認（approve_payrollまたはjob_role=hr_managerが必要。データベース上のステータスコードはcoo_approvedのまま）→ 支払確認（Adminのみ）',
            ],
            access: '本人分の閲覧：全従業員　全員分の閲覧 / バッチ計算：HR / 管理者（またはview_payroll権限保持者）　確認 / 承認：対応する承認権限を持つ者',
          },
          {
            icon: DollarSign,
            href: '/payroll/annual',
            title: '年間給与サマリー',
            desc: '1〜12月の給与を年単位で横断的に集計します。「本人」の年間記録を照会する際はステータスによる絞り込みを行わず（RLSのみで制御）、本人はすべてのステータス（草稿 / 審査中を含む）を確認できます。「マイ給与明細」が承認済み / 支払済みのみ表示するのとは異なります。',
            features: [
              '年度（当年 ±2年）を選択し、月別の明細と年間合計を確認',
              'データがない月は「—」と表示され、HRがその月の給与をまだ作成していないことを示します',
              '【HR / 管理者】「従業員」ドロップダウンを切り替えて、在職中の任意の従業員の年間サマリーを確認可能',
            ],
            access: '本人分の閲覧：全従業員　他者の閲覧：HR / 管理者',
          },
          {
            icon: BarChart3,
            href: '/admin/payroll/anomalies',
            title: '給与異常チェック',
            desc: '指定した年月の給与記録をスキャンし、残業46時間超、実支給額が前月比20%超変動、無給休暇の控除が基本給の半分超、当月の入社 / 退職、正社員の基本給が0円、の5種類の異常をマークします。サイドバーに独立した入口はなく、主な入口は「財務管理設定」内の埋め込みブロックです。',
            features: [
              '異常スキャンの実行：その月の古いマークをクリアしてから再スキャンし書き込み',
              'マーク済み異常の確認：既存のマークを読み込むのみで、再スキャンは実行されません',
              '本ページでは給与の修正はできず、マークと確認のみです。修正は給与テーブル / 明細ページで行います',
            ],
            access: '管理者限定（HR / 財務 / COOは対応する権限を持つ場合のみ）',
          },
          {
            icon: Landmark,
            href: '/admin/insurance-brackets',
            title: '労健保・労退等級表管理',
            desc: '年度ごとの労災保険 / 健康保険加入賃金等級表と、労働者退職金の月次拠出賃金等級表をアップロード・確認します（同一ページ内の2つの独立したブロック）。当年度の表が未アップロードの場合、給与バッチ計算で算出される保険料は0円になります（画面上で警告は出ますが計算は止まりません）。',
            features: [
              '労災保険 / 健康保険 / 労働者退職金の等級表をアップロード（xlsx / xls / csv。中国語・英語の列名を自動判別。プレビューとスキップされた行の理由を表示）。空白テンプレートのダウンロードも可能',
              '年度全体を上書きアップロード（同一年度の再アップロード＝旧表を削除＋新表を書き込み。同一トランザクション内で完了）',
              '年度を切り替えて既存の等級表を確認',
            ],
            access: '閲覧：財務 / COO / 管理者　実際のアップロード：財務給与関連権限を持つ者 / 管理者（財務 / COOはフォームは見えますがアップロードは403エラー）',
          },
          {
            icon: Gift,
            href: '/admin/bonuses',
            title: '賞与管理',
            desc: '従業員の賞与記録（年末 / 業績 / プロジェクト / その他）を作成 / 確認 / 削除します。給与バッチ計算は「年・月ともに一致」する賞与のみ当月の支給額に組み込みます。月を空欄にした賞与はどの月にも組み込まれません。',
            features: [
              '賞与記録の新規作成（従業員 / 種類 / 金額 / 月（任意） / 説明）— 月を空欄にすると、どのバッチ計算にも組み込まれません',
              '賞与記録の削除（再確認あり、復元不可）',
              '年度を切り替えて表示。その年度の賞与総額を表示',
            ],
            access: '管理：財務給与関連権限を持つ者 / 管理者（HRはボタンは見えますが実行すると403エラー）',
          },
          {
            icon: GraduationCap,
            href: '/training',
            title: '教育訓練',
            desc: '研修コースの割当と個人の証明書期限を管理します。',
            features: [
              'コースの作成・割当（教材リンク・必須マーク付き）',
              '従業員が完了をマークし修了証をアップロード。完了済みの記録は本人が未完了に戻すことはできず、管理者による操作が必要です',
              '証明書の登録と期限追跡（30日以内は「まもなく期限」表示）。自分の証明書のみ新規作成 / 編集可能で、削除には管理者権限が必要です',
              '【研修管理者】任意の従業員に代わって証明書を新規作成 / 編集 / 削除でき、「全員」にチェックを入れて全員分の証明書を確認可能',
              '【研修管理者】「期限リマインダー」タブに全社で60日以内に期限が切れる証明書を一覧表示',
            ],
            access: '閲覧 / 完了：全従業員　コース・証明書管理：研修管理権限を持つ従業員',
          },
          {
            icon: Target,
            href: '/performance',
            title: '人事考課',
            desc: '目標設定から上司評価まで、完全な人事考課サイクルを実施します。',
            features: [
              'HRが考課サイクルを作成',
              '従業員が目標を設定（ウェイト合計100%）→ 上司が承認または差戻し',
              '従業員が目標ごとに自己評価（1〜5点）を実施',
              '上司が目標ごとに採点し総評を実施（MFAが必要）→ 完了で結果をロック。評価対象者本人はHR / 管理者権限を持っていても自分の考課を承認・採点できません',
              '完了時にその期間の日報KPIスナップショット（目標 vs 実績）を自動保存',
              'HR / 管理者は全社の進捗を切り替えて確認し、完了済みの考課を再開できます（MFAが必要）',
            ],
            access: '目標 / 自己評価：本人　評価：直属の上司（HR / 管理者は全社を切り替え可能）　サイクル管理：HR / 管理者',
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
            desc: '会社の各種文書を一元管理し、承認フロー・AI翻訳・OCR全文検索に対応します。',
            features: [
              '文書のアップロード（PDF・Word・画像などの形式に対応）',
              '種別で分類：ANN / REG / NDA / MOU / CONTRACT / AMEND / INTERNAL',
              '承認フロー：アップロード → 承認待ち → 承認 / 却下 → アーカイブ（承認にはMFAが必要。自分がアップロードした文書は承認できません。INTERNAL文書は提出と同時に自動承認）',
              'AI翻訳：ワンクリックで多言語版を生成',
              '閲覧確認：重要文書の既読状況を追跡',
              'OCR全文検索：スキャンしたPDF / 画像からワンクリックでテキストを抽出し検索可能に。AI政策Q&Aは意味検索で回答し、出典を引用します',
            ],
            access: 'アップロード：全従業員　承認：文書承認権限者（approve_contract）/ Admin（MFA必須）',
          },
          {
            icon: Megaphone,
            href: '/announcements',
            title: 'お知らせ',
            desc: 'お知らせは「未確認」「すべて」「発行レポート」の3タブに分かれ、カードをクリックすると常に文書詳細ページ（/documents/[id]。/announcements/[id]ではありません）に遷移します。独立したお知らせ詳細ページには現在どこからのリンクもなく、孤立したルートです。',
            features: [
              '「未確認」は未読のお知らせを一覧表示。「すべて」はカテゴリ（緊急 / 管理 / 規程 / HR）とキーワードで絞り込み可能',
              '重要なお知らせはMFA認証を完了してから「確認済み」をクリックする必要があります。未確認はダッシュボードにリマインダー表示',
              '【発行権限者】「発行レポート」タブで各お知らせの確認状況を確認し、未確認の同僚へワンタップでTeams催促可能（4時間のクールダウンあり）',
              '【発行権限者】確認済みリストをExcelにエクスポート可能',
            ],
            access: '閲覧：全従業員　発行 / 発行レポート / 催促：お知らせ発行権限を持つ従業員',
          },
          {
            icon: FileSignature,
            href: '/contracts',
            title: '契約',
            desc: '会社の対外契約（NDA / MOU / 契約 / 契約修正）を確認・管理します。一般の同僚は互いの契約を見ることができず、アップロード者本人 / owner / 承認権限者のみ閲覧可能です。アップロード・アーカイブ・OCRは「文書」ページの同じ文書で操作する必要があり、本ページの詳細にはこれらのボタンはありません。',
            features: [
              '会社・状態・種別・キーワードで絞り込み。期限日は色分け表示（期限切れまたは30日以内は赤、31〜90日はオレンジ）',
              '承認フロー：承認待ち → 承認 / 却下（承認にはMFAが必要。自分がアップロードした契約は承認できません）',
              '期限の自動リマインド：期限の90日前と30日前にTeamsで承認権限者へ通知（バックグラウンドスケジュール、ボタン操作ではありません）',
              '承認・却下後は申請者へ自動通知。契約類はさらに営業責任者（COO）にも通知',
            ],
            access: '閲覧：管理者または契約承認権限者はすべて閲覧可能。その他は自分がアップロードした契約のみ　承認：契約承認権限者（approve_contract）/ Admin、MFA必須',
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
            desc: '全社のプロジェクトカードを閲覧（全従業員に表示）し、プロジェクトを作成してメンバーを管理し、メンバーの残業状況を追跡できます。プロジェクト詳細ページはURLを直接入力してアクセスする必要があり、一覧ページには現在クリック可能なリンクがありません。',
            features: [
              'すべてのプロジェクトカードを閲覧：名称 / 説明 / 責任者 / 状態 / メンバー数',
              '【プロジェクト作成権限を持つ者】プロジェクトの作成、責任者の指定（一般の権限保持者は自分自身のみを責任者に設定可能。Adminは任意の人物を指定可能）',
              'プロジェクト一覧を見られる人であれば誰でも「メンバー管理」を開いて追加可能（現時点で責任者専用に制限されていません）',
              '詳細ページ（URL直接入力が必要）でプロジェクト関連の残業申請を確認。プロジェクトの残業時間が閾値を超えると営業責任者（COO）へ自動通知',
            ],
            access: '閲覧：全従業員　作成：プロジェクト管理権限を持つ従業員　詳細ページ：管理者、責任者またはメンバー',
          },
        ],
      },
      {
        name: '購買',
        modules: [
          {
            icon: ShoppingCart,
            href: '/procurement',
            title: '購買概要',
            desc: '見積 → 購買申請 → 入荷検収 → 入庫 / 出庫 → 請求という購買チェーン全体の概要と、仕入先・商品・在庫の管理を行います。各書類種別は下記でそれぞれ独立したタブで管理され、本ページは集約入口という位置づけです。',
            features: [
              '書類チェーン：見積 → 購買申請 → 入荷検収 → 入庫 / 出庫 → 請求',
              '多段階承認エンジン（部門長 / COO / CEO / 会計）。承認にはMFAが必要',
              'バーコードスキャン（スキャナー / スマホカメラ）で入出庫時に数量を自動加減',
              '承認済みの入荷検収書はワンクリックで資産に転換可能（asset_manage権限が必要）。承認済み書類の取消は購買管理権限者限定でMFAが必要',
            ],
            access: '閲覧：購買権限を持つ従業員',
          },
          {
            icon: FileText,
            href: '/procurement/rfqs',
            title: '見積依頼書',
            desc: '申請者が品目を記入し、見積担当者を指定します。見積担当者は品目ごとに複数の仕入先の見積を登録し「採用」にチェックした後、部門長の承認へ送付します。承認後はワンクリックで購買申請書に転換できます。',
            features: [
              '草稿を作成し品目を追加。品目ごとに複数の仕入先の見積を登録し「採用」にチェック（同一品目につき採用は1件のみ）。見積書の添付ファイルもアップロード可能',
              '承認中も見積担当者は内容を編集し続けられます（例外的に許可）。承認フロー：見積担当者の段階 → 部門長の段階（いずれもMFAが必要）',
              '部門長に上司がいない、または本人が上司自身の場合は、procurement_payment_approve権限保持者が代理承認し、申請が滞留するのを防ぎます',
              '承認後、「購買申請書へ転換」で品目と採用単価が自動反映',
              '【procurement_manage / admin + MFA】承認済み / 却下済みの申請書を「取消して複製」',
            ],
            access: '閲覧 / 作成：購買権限を持つ従業員',
          },
          {
            icon: ShoppingCart,
            href: '/procurement/purchase-requests',
            title: '購買申請書',
            desc: '仕入先への発注品目 / 金額 / 支払条件を記録し、「部門長 → COO（合計3,000超）→ CEO（合計20,000超）→ 購買部門への通知」という承認フローを経ます。承認後は入荷検収書または手付金請求書に転換できます。',
            features: [
              '仕入先を選択すると統一番号 / 連絡先 / 支払情報が自動反映。小計 / 税額 / 合計は常にサーバー側で再計算され、フロントエンドの値を上書きします',
              '提出後、合計金額に応じてCOO / CEOの承認段階が自動的に追加されるかどうか決まります（閾値は「COO設定」で調整可能）。購買部門への通知は常に保持されます',
              '承認後、「入荷検収書」または「手付金請求書」に転換可能',
              '【procurement_manage / admin + MFA】取消、または取消して複製のみ',
              '1枚の購買申請書につき未取消の購買請求書は1枚のみ（v1.0.4より）',
            ],
            access: '閲覧 / 作成：購買権限を持つ従業員',
          },
          {
            icon: Package,
            href: '/procurement/goods-receipts',
            title: '入荷検収書',
            desc: '仕入先からの入荷検収結果 / 金額 / 請求書情報を記録します。「最終編集者 → 任意の購買担当者」の2段階確認を経て入庫書 / 請求書に転換可能、または（資産管理者限定）直接資産に転換できます。',
            features: [
              '元となる購買申請書番号を反映可能。仕入先 / 金額 / 請求書情報を入力し、請求書と出荷証憑をアップロード',
              '「手付金支払済み」にチェックし、手付金請求書番号と金額を入力（手付金請求書が承認されると自動反映）',
              '承認フロー（最終編集者が確認 → 任意の購買担当者が確認、いずれもMFAが必要）',
              '【asset_manage権限】承認後「資産に転換」でワンクリックで資産モジュールに登録',
              '【procurement_manage / admin + MFA】「取消して複製」。未取消の下流書類がある場合はブロックされ、該当書類番号が表示されます',
            ],
            access: '閲覧 / 作成：購買権限を持つ従業員',
          },
          {
            icon: Building2,
            href: '/procurement/vendors',
            title: '仕入先マスタ',
            desc: '購買先の基本情報 / 連絡先 / 会計 / 銀行などの項目を管理し、見積依頼書 / 購買申請書などに自動反映されます。現在のUIには削除機能がありません。',
            features: [
              '仕入先一覧を閲覧（検索 / ソート / ページネーション可能）。行をクリックすると詳細ポップアップで全項目を確認',
              '【procurement_manage / admin】仕入先の新規作成 / 編集（一般のprocurement_unitにはこのボタンは表示されません）',
              'procurement_manageが不要な作成経路：「仕入先審査評価」を提出してCOOの承認を受け、承認後に自動的に登録され仕入先番号が発行されます',
            ],
            access: '閲覧：購買権限を持つ従業員　新規作成 / 編集：購買管理権限を持つ従業員',
          },
          {
            icon: Package,
            href: '/procurement/products',
            title: '商品マスタ',
            desc: '購買商品データと「購買単位 × 換算率 = 在庫単位」の二重単位換算設定を管理し、各仕入先の過去の見積を比較のために確認できます。',
            features: [
              '商品一覧を閲覧。表に二重単位換算と現在の在庫量を表示',
              '行をクリックして詳細ポップアップを表示：規格 / カテゴリ / 在庫量、二重単位換算式、過去の比較見積表（仕入先の見積は見積依頼書の承認後に自動登録され、本ページで手動管理するものではありません）',
              '商品名をクリックすると「商品入出庫元帳」で在庫変動履歴を確認可能（照会専用）',
              '【procurement_manage / admin】商品の新規作成 / 編集 / 削除',
            ],
            access: '閲覧：購買権限を持つ従業員　新規作成 / 編集 / 削除：購買管理権限を持つ従業員',
          },
          {
            icon: ClipboardList,
            href: '/procurement/evaluations',
            title: '仕入先／商品審査評価',
            desc: '承認フローで新規仕入先データを登録する、または比較見積の出典に関する備考を記録する2つのフォーム（同一ページ内の2タブ）です。仕入先評価は承認後、自動的に仕入先マスタに登録されます。商品評価は出典となる見積依頼書番号と備考のみを登録し、品目ごとの比較エディタは含まれず、比較結果も自動登録されません。',
            features: [
              '「仕入先評価」：仕入先項目＋備考の草稿を記入。承認は常にCOOが行い、承認後に自動的に仕入先マスタへ登録され番号が発行されます',
              '「商品評価」：出典の見積依頼書番号＋備考を記入。承認は直属の上司が行います（上司がいない場合は自己承認）',
              '詳細ポップアップで承認の時系列を確認。自分の順番になれば承認 / 却下できます（MFAが必要）',
            ],
            access: '閲覧 / 作成：購買権限を持つ従業員',
          },
          {
            icon: Package,
            href: '/procurement/inventory',
            title: '在庫作業（入庫 / 出庫 / 照会）',
            desc: '入庫書は貨物を倉庫に受け入れロット在庫に記録します。出庫書は在庫を減算します（使用 / 消耗 / 廃棄）。「在庫照会」はスキャナーやスマホカメラで商品コード / ロット番号を読み取り、現在庫を素早く確認できます。3つのタブは同じ権限セットを共有します。',
            features: [
              '入庫 / 出庫書の草稿を作成（手動入力またはスキャンで自動反映 / ロット累積）。承認は単一段階で、作成者本人の確認がそのまま承認になります（MFAは必要）',
              '転記：入庫はロット在庫と元帳に記録（同一検収書に対する累計入庫量は検収数量を超えられません）。出庫は在庫を減算（不足時はブロック）',
              '逆転記：転記済み書類を逆転記。当該ロットが後続の出庫で既に使用済みの場合はブロックされます',
              '承認済み書類は削除・取消ができず、逆転記または管理者への相談のみ可能',
              '【procurement_manage / admin】他人の草稿を編集 / 削除し、代理で逆転記できます。「在庫照会」タブは照会専用で書き込み操作はありません',
            ],
            access: '閲覧 / 操作：購買権限を持つ従業員',
          },
          {
            icon: Receipt,
            href: '/procurement/payments',
            title: '請求書（手付金 / 買掛金 / 分割）',
            desc: '手付金請求書は通常購買申請書から転換して生成されます。買掛金請求書は通常承認済みの入荷検収書から転換して生成されます。分割請求書は買掛金請求書の明細ページの「分割請求を作成」からのみ、期ごとに生成できます。3種類の書類にはいずれも削除・取消ボタンがありません。',
            features: [
              '元書類から転換して草稿を生成（銀行情報が自動反映）、または直接手動で作成。1枚の購買申請書につき未取消の買掛金請求書は1枚のみ（v1.0.4より）',
              '金額 / 送金期限 / 銀行情報を編集し提出（会計の単一段階）',
              '【job_role=finance または admin + MFA】承認 / 却下。作成者本人は自分が提出した請求書を承認できません（職務分離）',
              '買掛金請求書を分割設定した後、承認後に「分割請求を作成」で期ごとに生成可能（期数は自動採番）',
              '手付金請求書が承認されると、対応する入荷検収書に手付金支払済み情報が自動反映',
            ],
            access: '閲覧 / 作成：購買権限を持つ従業員　承認：財務または管理者',
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
            desc: '資産台帳と貸出・保守・棚卸の記録を管理します。',
            features: [
              '資産台帳（IT機器 / 実験機器 / 什器）',
              '貸出 / 返却（保管者を自動更新）',
              '保守 / 校正 / 修理の記録（添付ファイル付き）。完了時に次回期限を自動設定',
              '「期限リマインダー」タブに60日以内に期限が切れる、または期限超過の校正 / 保守項目を一覧表示。全従業員が閲覧可能（廃棄済みの資産は表示されません）',
              '承認済みの購買入荷検収書からワンクリックで資産に登録可能（同一検収書は1回のみ転換可能。台帳への金額の重複計上を防止）',
            ],
            access: '閲覧：全従業員（読み取り専用。期限リマインダーを含む）　変更：資産管理権限を持つ従業員',
          },
          {
            icon: FlaskConical,
            href: '/lab',
            title: '試薬・消耗品',
            desc: '試薬・消耗品のロット番号・有効期限・使用状況を管理します。全従業員が品目 / ロット / 期限リマインダーを閲覧できますが、「変更履歴」の明細は管理者のみ閲覧可能です。',
            features: [
              '品目一覧をキーワード / カテゴリで検索し、展開して全ロット（ロット番号 / 有効期限 / 数量）を確認。「期限リマインダー」に切り替えて今後60日以内に期限が切れるロットを確認',
              '【lab_manage権限またはadmin】品目の新規作成 / 編集 / 削除。新規ロットの入庫（ロット番号 / 有効期限 / 数量）',
              '【lab_manage権限またはadmin】ロットに対して「使用」/「開封」/「廃棄」を実行（在庫の引き落としは原子的トランザクション）',
              '【lab_manage権限またはadmin限定。一般従業員には表示されません】ロットの完全な変更履歴を確認（操作者と時刻を含む）',
            ],
            access: '閲覧（変更履歴を除く）：全従業員　変更と変更履歴：試薬・消耗品管理権限を持つ従業員',
          },
        ],
      },
      {
        name: 'その他',
        modules: [
          {
            icon: MessageSquarePlus,
            href: '/feedback',
            title: 'フィードバック',
            desc: '自分が送信したフィードバックの履歴と対応状況を確認し、コメントスレッドで補足説明を追加できます。送信後は記名式で、Adminのみ閲覧可能です（匿名ではありません）。',
            features: [
              '自分が送信したすべてのフィードバックを確認（種類 / 状態 / 送信時刻 / 添付画像）',
              '「フィードバックを追加」をクリックすると送信フォームへ：種類を選択（機能提案 / バグ報告）、タイトルと説明を入力、スクリーンショット1枚を任意で添付',
              'コメントスレッドで管理者に返信。「完了」または「差戻し」の状態でコメントを追加すると自動的に「対応待ち」に再オープンされます',
              '本ページには自分のフィードバックのみ表示。Adminは「フィードバック管理」で全社のフィードバックを確認し、状態を変更します',
            ],
            access: '閲覧：本人のフィードバックのみ',
          },
          {
            icon: Settings,
            href: '/settings',
            title: '個人設定',
            desc: '個人の環境設定を管理します。各ユーザーは自分自身の設定のみ確認・変更できます（Admin専用の「システム設定」とは別のページです）。',
            features: [
              '表示名の変更',
              'インターフェース言語の切替（繁体字中国語 / English / 日本語）',
              'ダーク / ライトモードの切替',
              '二要素認証（MFA）の管理：自分でリセット可能。次回ログイン時に再度QRコードでの設定が必要',
            ],
          },
        ],
      },
      {
        name: '人事行政（管理）',
        modules: [
          {
            icon: UsersRound,
            href: '/admin/users',
            title: 'ユーザー管理',
            desc: '全社のアカウント一覧です。部門 / システムロール / 職能ロール / 雇用情報を調整し、退職した同僚のアカウントを無効化します。アカウントはここで新規作成できず、必ず本人が初めてEntraでログインした際に自動作成されます。',
            features: [
              '部門 / 雇用形態 / 勤務地 / 直属の上司 / 代理承認者 / 有効状態を編集',
              '【Admin限定】システムロール、職能ロール（hr_manager / finance / coo / ceo）と個別権限フラグを編集',
              '【Admin限定】ユーザーを無効化する前に「退職引継ぎチェック」を表示（未完了の契約 / 進行中のプロジェクト / 承認待ちの申請 / 未払いの給与）。Admin以外のHRがアカウントを無効化する場合は「編集」ダイアログで状態を変更するのみで、引継ぎリマインダーは表示されません',
              '【Admin限定】人事情報アイコンをクリックすると給与と個人情報の編集画面へ（HRがクリックすると権限なしページへリダイレクトされます）',
            ],
            access: '閲覧 / 一部編集：HR（個別権限が必要。job_roleの設定だけでは不十分）/ 管理者　完全編集（ロール / 管理者の無効化）：管理者限定',
          },
          {
            icon: Building2,
            href: '/admin/departments',
            title: '部門管理',
            desc: '部門一覧（コード＋名称）を管理し、ユーザー管理 / 採用 / 承認などのモジュールのドロップダウンで使用されます。新規作成と編集のみ対応し、削除機能はありません。',
            features: [
              '部門の新規作成（名称＋コード、10文字以内、自動大文字変換）',
              '既存の部門名称 / コードを編集',
            ],
            access: '管理者限定（HRはいずれの権限でも利用不可）',
          },
          {
            icon: Building2,
            href: '/admin/companies',
            title: '取引会社マスタ',
            desc: '「取引会社」マスタ（名称＋別名リスト）を管理し、契約管理 / 文書管理で所属会社を選択する際に使用します。ここでの「会社」は外部の取引先であり、myOPS自社の法人一覧ではありません。',
            features: [
              '既存の会社を検索（名称または別名で）',
              '会社の新規作成（名称＋カンマ区切りの別名リスト）',
              '既存の会社名称 / 別名を編集（削除機能はありません）',
            ],
            access: '管理者限定',
          },
          {
            icon: LogOut,
            href: '/admin/lifecycle',
            title: '入社／退職フロー',
            desc: 'HRが新入社員 / 退職者ごとの引継ぎチェックリストを追跡します（入社は10項目 / 退職は8項目の既定テンプレート）。現在サイドバーにはAdmin以外のHR向けのリンクがなく、URLを知っている必要があります。機能は既定で無効になっており、Adminが先に有効化する必要があります。',
            features: [
              '対象者と種別（入社 / 退職）を選択し、既定テンプレートから自動展開される引継ぎチェックリストを作成',
              '項目ごとにチェックして完了（時刻を記録）、備考の記入、カスタム項目の追加',
              'すべて完了するとリスト全体が「完了」になり、いずれかの項目のチェックを外すと自動的に「進行中」に戻ります',
            ],
            access: 'HR（個別権限）/ 管理者（HRはサイドバー入口がなくURLを知る必要があります）',
          },
          {
            icon: UserPlus,
            href: '/admin/recruiting',
            title: '採用管理',
            desc: '求人と応募者を管理します（応募 → 書類選考 → 面接 → オファー → 採用 / 不採用）。サイドバーには同様にAdmin以外のHR向け入口がなく、機能は既定で無効です。履歴書ファイルはHR / 管理者のみダウンロード可能です。',
            features: [
              '求人の作成 / 編集 / 終了（職種名、部門、応募資格、募集人数）',
              '応募者を追加し履歴書をアップロード。ドラッグで段階を切替：応募 → 書類選考 → 面接 → オファー → 採用 / 不採用',
              '面接記録の追加（日付、1〜5段階評価、テキストフィードバック）',
            ],
            access: 'HR（個別権限）/ 管理者（HRはサイドバー入口がなくURLを知る必要があります）',
          },
          {
            icon: UsersRound,
            href: '/admin/hr-settings',
            title: 'HR管理',
            desc: '人事設定の集約ページで、打刻 / 残業パラメータ、休暇種別管理、残業料率、勤怠異常一覧（読み取り専用）、年間賞与記録を埋め込んでいます。本ページのHR判定はjob_roleを使用し、ユーザー管理 / 入社退職 / 採用管理で使用されるgranted_features判定とは異なる仕組みです。',
            features: [
              '打刻 / 残業のシステムパラメータを編集（既定の出退勤時刻、打刻忘れリマインダー日数など）',
              '休暇種別管理、残業料率管理ブロック（独立ページと同じ機能）',
              '勤怠異常一覧を確認（直近30日の自動補完打刻異常、今月打刻漏れのインターン）',
              '年間賞与記録の管理。COOが本ページに入ると各ブロックはすべて読み取り専用になります（鍵アイコン表示）',
            ],
            access: '閲覧：HR / COO / 管理者　編集：HR（job_role）/ 管理者',
          },
        ],
      },
      {
        name: 'システム管理',
        modules: [
          {
            icon: Settings,
            href: '/admin/settings',
            title: 'システム設定',
            desc: '機能モジュールのオン/オフ、AI接続（プロバイダー / APIキー / モデル / Embedding）、打刻 / 通知 / システムパラメータなど、サイト全体の設定です。財務管理設定 / COO設定とは異なり、本ページには他の職能ロール向けの読み取り専用ビューはありません。',
            features: [
              'モジュールごとにワンクリックでオン / オフ（出退勤 / 休暇 / 給与 / 文書 / 購買など）。オフにすると一般従業員はそのモジュールを一切閲覧・利用できなくなります',
              'AI接続設定：プロバイダーを選択しAPIキー / モデルを入力。「接続テスト」でその場で検証',
              'Embedding設定：政策Q&Aのベクトル検索を有効化。モデル変更後は「文書インデックスの再構築」をクリックして全件再実行が必要',
              '機密情報（APIキー、Teams Botシークレット）はフロントエンドに一切返されず、画面には「設定済み / 未設定」のみ表示',
            ],
            access: '管理者限定（HR / 財務 / COOはこのページに一切アクセスできません。読み取り専用も含む）',
          },
          {
            icon: Landmark,
            href: '/admin/finance-settings',
            title: '財務管理設定',
            desc: '給与関連のシステムパラメータ（支払日など）、労健保 / 労退等級表、給与異常スキャンの管理入口です（独立ページと同じコンポーネントを共有）。',
            features: [
              '「支払日」と「給与自動生成日」を編集',
              '労災保険 / 健康保険 / 労働者退職金の月次拠出賃金、3つの等級表を管理',
              '給与異常スキャンを実行',
            ],
            access: '閲覧（読み取り専用）：COO / 管理者　編集：財務 / 管理者（HRはこのページにアクセスできません）',
          },
          {
            icon: ShieldCheck,
            href: '/admin/coo-settings',
            title: 'COO設定',
            desc: 'プロジェクト残業のTeams通知閾値、契約期限リマインド日数、購買申請書の金額別承認閾値などの運営ポリシーパラメータを設定します。',
            features: [
              '「プロジェクト残業COO承認閾値（時間）」を設定：閾値を超えるとTeamsで在職中の全COOへ通知（単なるリマインドで追加の承認段階ではありません）',
              '契約期限の1回目 / 2回目のリマインド日数を設定',
              '購買申請書の金額別承認閾値（COO / CEOの段階）を設定。草稿ページでは通過する段階をリアルタイムでプレビュー可能',
            ],
            access: '閲覧（読み取り専用）：HR / 管理者　編集：COO / 管理者（財務はこのページにアクセスできません）',
          },
          {
            icon: Bot,
            href: '/admin/bot-policy',
            title: 'Teamsワンタップ承認ポリシー設定',
            desc: '購買関連10種類の書類それぞれについて、Teamsカードで「ディープリンク」か「ワンタップ直接承認」のどちらを使うかを制御します。既定はすべてオフ（ディープリンク＋MFAという最も安全なモード）で、オンにするとMFA保護を犠牲にして速度を得られます。',
            features: [
              '購買関連10種類の書類ごとにTeamsワンタップ直接承認のオン / オフを設定（既定は全てオフ）',
              '金額項目を持つ書類種別にはワンタップ直接承認の金額閾値を設定可能。閾値以上の場合は依然としてディープリンク＋MFAが強制されます',
              '設定変更は次に送信される新しい通知から即時反映され、既に送信済みの旧カードは遡って無効化されません。ただし承認時には常に現在のポリシーと再照合するため、旧カードが新たに厳格化されたポリシーを回避することはできません',
              'この設定は購買関連10種類の書類のみを対象とします。休暇 / 残業 / 経費精算など他の承認のTeams通知は常にテキストのみ＋ディープリンクです',
            ],
            access: '管理者限定',
          },
          {
            icon: ScrollText,
            href: '/admin/audit',
            title: '監査ログ',
            desc: 'サイト全体の監査ログ検索ページです。文書関連の監査イベント（アップロード / 承認 / 却下 / 既読確認 / アーカイブ / OCRなど）を検索 / 絞り込みできます。「関連文書」欄はプレーンテキストで、クリック可能なリンクではありません。',
            features: [
              'キーワードでアクション種別を検索、ドロップダウンで単一のアクション種別を絞り込み',
              '1ページ50件でページ送り閲覧（時刻 / 操作者 / アクション / 関連文書タイトル / 備考）',
            ],
            access: 'Admin / HR（一般従業員は自分がアクセス権を持つ文書のサイド監査ブロックのみ）',
          },
          {
            icon: MessageSquarePlus,
            href: '/admin/feedback',
            title: 'フィードバック管理',
            desc: '全社のフィードバック管理一覧です。全員が提出したフィードバックを確認・絞り込み・状態変更し、コメントスレッドで提出者に返信できます。',
            features: [
              '状態（対応待ち / 対応中 / 完了 / 差戻し）と種類で絞り込み',
              'ドロップダウンで個々のフィードバックの状態を切替',
              '詳細を開いて説明全文と添付画像を確認し、提出者に返信。提出者が「完了」または「差戻し」の項目にコメントを追加すると自動的に「対応待ち」に再オープン',
            ],
            access: '管理者限定（HRを含め誰も入れません）',
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
          { feature: '休暇カレンダー /leave/calendar', employee: '△', manager: '△', hr: true, admin: true, note: '孤立ページ。一般従業員 / 上司は同部門のみ' },
          { feature: '経営ダッシュボード', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: '勤怠管理',
        rows: [
          { feature: '出退勤打刻', employee: true, manager: true, hr: true, admin: true },
          { feature: '打刻漏れ申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '打刻漏れ承認', employee: false, manager: true, hr: true, admin: true },
          { feature: '全従業員の勤怠確認 / 無効化', employee: false, manager: false, hr: true, admin: true, note: 'HR判定にjob_roleを含む。他ページとは異なる' },
          { feature: '打刻範囲設定 /admin/geofences', employee: false, manager: false, hr: false, admin: true, note: '唯一 admin のみ対応のページ' },
          { feature: 'シフト管理 /admin/shifts', employee: false, manager: false, hr: '△', admin: true, note: 'COOは対象外。他の3ページとは異なる' },
          { feature: '勤怠異常 /admin/attendance-anomalies', employee: false, manager: false, hr: '△', admin: true, note: 'job_roleのみで判定。個別権限は対象外' },
        ],
      },
      {
        name: '休暇 / 残業',
        rows: [
          { feature: '休暇申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '休暇承認', employee: false, manager: true, hr: true, admin: true, note: 'HR判定はjob_roleを含まない。出退勤とは異なる' },
          { feature: '承認済み休暇の撤回', employee: '△', manager: false, hr: true, admin: true, note: '開始前は自分で撤回可能。開始後はHR/admin限定' },
          { feature: '休暇種別管理 / 休暇残高', employee: false, manager: false, hr: '△', admin: true, note: 'job_roleのみで判定。個別権限は対象外' },
          { feature: '残業申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '残業承認', employee: false, manager: true, hr: false, admin: true, note: 'HRは承認不可。上司 / プロジェクト責任者 / adminのみ' },
        ],
      },
      {
        name: '出張',
        rows: [
          { feature: '出張申請', employee: true, manager: true, hr: true, admin: true },
          { feature: '出張承認', employee: false, manager: true, hr: true, admin: true, note: '承認者は提出時点の上司に固定' },
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
          { feature: '全従業員の給与確認 / バッチ計算', employee: false, manager: false, hr: true, admin: true, note: 'バッチ計算は手動ボタン。スケジュール自動実行ではない' },
          { feature: '給与確認 / 承認', employee: false, manager: false, hr: false, admin: '△', note: 'confirm/approve_payroll 権限が必要' },
          { feature: '年間給与サマリー（他者の確認）', employee: false, manager: false, hr: true, admin: true, note: 'view_payroll 権限が必要' },
          { feature: '給与異常チェック /admin/payroll/anomalies', employee: false, manager: false, hr: '△', admin: true, note: '財務給与関連の権限が必要' },
          { feature: '労健保 / 労退等級表アップロード', employee: false, manager: false, hr: '△', admin: true, note: 'finance_payroll が必要。財務 / COOはフォームのみ閲覧可能' },
          { feature: '賞与管理 /admin/bonuses', employee: false, manager: false, hr: '△', admin: true, note: 'finance_payroll が必要。HRはボタンは見えるが403エラー' },
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
          { feature: '購買業務 / 書類作成（見積 / 購買申請 / 検収）', employee: false, manager: '△', hr: false, admin: '△', note: '購買権限が必要。役職自体は問わない' },
          { feature: '購買承認（部門長→COO→CEO）', employee: false, manager: '△', hr: false, admin: '△', note: '閾値はCOO設定で調整可能' },
          { feature: '入庫書 / 出庫書の承認', employee: false, manager: '△', hr: false, admin: '△', note: '作成者本人が確認。MFAが必要' },
          { feature: '請求承認（手付金 / 買掛金 / 分割）', employee: false, manager: false, hr: false, admin: '△', note: '財務ロールが必要。自分の請求書は承認不可' },
          { feature: '仕入先 / 商品マスタの新規作成・編集', employee: false, manager: '△', hr: false, admin: '△', note: '購買管理権限が必要。または仕入先評価から自動登録' },
          { feature: '資産への転換（検収書→資産）', employee: false, manager: '△', hr: false, admin: '△', note: 'asset_manage 権限が必要。1回のみ転換可能' },
          { feature: '承認済み書類の取消', employee: false, manager: false, hr: false, admin: '△', note: 'RFQ/PR/GRのみ取消入口あり。MFAが必要' },
        ],
      },
      {
        name: 'Teamsワンタップ承認',
        rows: [
          { feature: 'Teamsワンタップ承認ポリシー設定 /admin/bot-policy', employee: false, manager: false, hr: false, admin: true, note: 'admin限定。既定は全てオフ（ディープリンク＋MFA）' },
          { feature: 'Teamsワンタップ承認／却下カード', employee: '△', manager: '△', hr: '△', admin: '△', note: '購買関連10種類の書類のみ。それ以外は常にディープリンク＋MFA' },
          { feature: 'Teamsテキストコマンド照会', employee: true, manager: true, hr: true, admin: true, note: '自分自身のデータのみ返信。AIフォールバックは別途設定が必要' },
        ],
      },
      {
        name: '資産 / 試薬・消耗品',
        rows: [
          { feature: '資産 / 在庫の閲覧', employee: true, manager: true, hr: true, admin: true },
          { feature: '資産の変更管理', employee: false, manager: '△', hr: '△', admin: '△', note: 'asset_manage 権限が必要' },
          { feature: '試薬・消耗品—変更履歴 / 管理操作', employee: false, manager: '△', hr: '△', admin: '△', note: '閲覧は全員可能。変更履歴は管理者限定' },
        ],
      },
      {
        name: 'プロジェクト / その他',
        rows: [
          { feature: 'プロジェクト一覧の閲覧', employee: true, manager: true, hr: true, admin: true, note: '全員に表示。メンバーかどうかで絞り込まれない' },
          { feature: 'プロジェクトの作成／責任者指定', employee: false, manager: false, hr: false, admin: true, note: 'manage_projects 権限が必要' },
          { feature: 'プロジェクトメンバー管理', employee: true, manager: true, hr: true, admin: true, note: '現時点で責任者専用に限定されていない' },
          { feature: 'フィードバック送信（記名）', employee: true, manager: true, hr: true, admin: true },
          { feature: 'フィードバック閲覧', employee: false, manager: false, hr: false, admin: true },
          { feature: '管理者パネル', employee: false, manager: false, hr: false, admin: true },
        ],
      },
      {
        name: '人事行政（管理）',
        rows: [
          { feature: 'ユーザー管理 /admin/users', employee: false, manager: false, hr: '△', admin: true, note: '個別権限が必要（job_roleのみでは不十分）' },
          { feature: 'ユーザー人事情報 /admin/users/[id]/profile', employee: false, manager: false, hr: false, admin: true, note: '最も制限が厳しい：HRも不可、本人も閲覧不可' },
          { feature: '部門管理 / 取引会社マスタ', employee: false, manager: false, hr: false, admin: true, note: 'admin限定。HRはいずれの権限でも利用不可' },
          { feature: '入社／退職フロー /admin/lifecycle', employee: false, manager: false, hr: '△', admin: true, note: '個別権限が必要。サイドバー入口もない' },
          { feature: '採用管理 /admin/recruiting', employee: false, manager: false, hr: '△', admin: true, note: '同上。既定で無効、履歴書はHR/admin限定でダウンロード可能' },
          { feature: 'HR管理 /admin/hr-settings', employee: false, manager: false, hr: '△', admin: true, note: 'HRは編集にjob_roleが必要。COOは読み取り専用' },
        ],
      },
      {
        name: 'システム管理',
        rows: [
          { feature: 'システム設定 /admin/settings', employee: false, manager: false, hr: false, admin: true, note: '読み取り専用すら他ロールには開放されていない' },
          { feature: '財務管理設定 /admin/finance-settings', employee: false, manager: false, hr: false, admin: true, note: 'COOは読み取り専用。財務は編集可能。HRはアクセス権なし' },
          { feature: 'COO設定 /admin/coo-settings', employee: false, manager: false, hr: '△', admin: true, note: 'HRは読み取り専用。COOは編集可能。財務はこのページなし' },
          { feature: '監査ログ /admin/audit', employee: false, manager: false, hr: true, admin: true, note: 'admin/HRは全社を照会可能。従業員は単一文書に限定' },
          { feature: 'フィードバック管理 /admin/feedback', employee: false, manager: false, hr: false, admin: true, note: 'admin限定。HRを含め誰も入れない' },
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
