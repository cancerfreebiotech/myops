# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-06-11

### Fixed
- **Cron 端點被登入攔截**：`proxy.ts` 把 Vercel Cron 的請求（無 session cookie）一律 307 轉向 /login，排程永遠打不到 route——三個 cron 端點（clock-reminder、daily-digest、notify）加入 middleware 豁免清單，依賴各自的 fail-closed CRON_SECRET 驗證（payroll 端點不豁免，維持 MFA 強制檢查）

### Chore
- 版本進位：依新規則（patch 最大 9）自 v0.2.50 進位至 v0.3.0

## [0.2.50] - 2026-06-11

### Added
- **平板 Drawer 側欄**：md–lg 區間新增頂部列 + 漢堡選單，點擊滑入完整側欄（遮罩關閉、ESC、路由切換自動收合），桌面與手機行為不變
- **Vercel Cron 排程**（`vercel.json`）：每日待辦摘要平日 08:30、打卡提醒平日 07:00（上班）/ 17:30（下班）（台北時間）；cron route 補上 GET handler 並依台北時間自動判斷提醒類型

### Changed
- **程式碼品質**：清除全部 248 個既有 ESLint 問題（`any` 改為實際型別、移除未用變數、effect 內 setState 重構、hook 依賴修正；僅保留 1 處經評估不可安全改動者），並修正公告列表搜尋競態問題
- **CI**：GitHub Actions 升級 checkout/setup-node v5、Node 24；新增 `.gitattributes` 強制 LF 換行

### Security
- **Cron 端點改為 fail-closed**：`notify`、`clock-reminder`、`daily-digest` 在 `CRON_SECRET` 未設定時一律拒絕（原為 fail-open）——部署需設定 `CRON_SECRET` 環境變數

## [0.2.49] - 2026-06-10

### Fixed
- **API 錯誤訊息多語化**：21 個 API route 的錯誤回應改為依使用者語言回傳（next-intl 伺服器端翻譯，新增 `apiErrors` 命名空間；Teams 機器人訊息與匯出報表內容維持原樣）
- **觸控目標**：按鈕、側欄、底部導覽在觸控裝置上保證 ≥44px（Tailwind `pointer-coarse:` variant，桌面密度不變）
- **表格手機橫向捲動**：出勤紀錄與使用者列表表格補上 `overflow-x-auto`
- **Dark mode 對比**：移除 16 處 `text-white` 直書（改 `text-gray-50` 或補 `dark:` variant），修正勞健保上傳區與出勤管理表頭的深色模式對比

### Security
- `/api/teams/notify` 加上 CRON_SECRET Bearer 驗證（比照其他 cron 端點）

## [0.2.48] - 2026-06-10

### Fixed
- **i18n 全面補洞**：抽出 22 個元件中約 218 條 hardcode 中文字串，改為 next-intl `t()` 翻譯鍵，zh-TW / en / ja 三語檔同步新增（涵蓋 admin 管理頁表頭、按鈕、placeholder、aria-label、toast 訊息等）
- **回饋管理截圖**（`/admin/feedback`）：原生 `<img>` 改為 `next/image`（fill + aspect-video 容器，避免 layout shift）

### Added
- **Footer**：掛載至 dashboard layout，依 PRD 固定格式顯示 `坂本 | v{version} | Deployed: {time}`（讀取 `NEXT_PUBLIC_AUTHOR_NAME` / `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_DEPLOY_TIME`）

### Chore
- 三語訊息檔結構驗證一致（各 995 個 leaf key）；`npm run build` 通過

## [0.2.47] - 2026-04-10

### Changed
- **HR 管理頁面**（`/admin/hr-settings`）：直接嵌入假別管理、假別額度、加班費率、出勤異常、獎金管理功能，移除外部連結
- **財務管理頁面**（`/admin/finance-settings`）：直接嵌入勞健保級距表、薪資異常檢查功能，移除外部連結
- **Sidebar**：移除 7 個已嵌入設定頁的獨立管理項目（leave-types, leave-balances, overtime-rates, attendance-anomalies, bonuses, insurance-brackets, payroll/anomalies）
- **管理組件 readOnly 支援**：LeaveTypesManager、LeaveBalancesManager、OvertimeRatesManager、BonusClient、InsuranceBracketsClient 加上 `readOnly` prop，COO 角色唯讀檢視

### Removed
- `HRManagementLinks` 組件（功能已嵌入 HR 管理頁）
- `FinanceManagementLinks` 組件（功能已嵌入財務管理頁）

## [0.2.44] - 2026-04-08

### Added
- **職能角色系統（job_role）**：新增 `job_role` 欄位（member / hr_manager / finance / coo）
  - DB migration：`users.job_role` 欄位，並將舊 `granted_features` 中的角色標記自動遷移
  - HR 角色：可修改部門/職位/停用帳號，不可更改系統角色
  - Finance 角色：可存取加班費率管理、勞健保級距管理（原本僅 Admin）
  - COO 角色：可管理 COO 設定、唯讀 HR/Finance 設定
- **職能角色預設功能矩陣**（`src/lib/job-role-features.ts`）
- **財務管理頁**新增費率管理連結（加班費率、勞健保級距）
- **使用者管理頁**：HR 角色可存取，但僅能修改允許欄位

### Changed
- `src/lib/features.ts`：移除角色標記（hr_manager / finance_payroll / coo_notify），新增 12 個個別指派功能
- `src/lib/role-settings.ts`：`KEY_OWNER` 對應值改為 job_role 識別碼
- 設定頁存取改為檢查 `job_role` 而非 `granted_features`
- `UserEditForm`：新增職能角色欄位（Admin 才能修改），角色/個別授權僅 Admin 可見
- Sidebar：非 Admin 的 HR/Finance/COO 顯示對應管理頁連結

## [0.2.33] - 2026-04-07

### Fixed
- CI build 修復：將 `feature-flag-keys.ts` 拆出為 client-safe 常數檔
  - `SettingsClient.tsx`（Client Component）原本 import `feature-flags.ts` 導致 `next/headers` 被打包進 client bundle，Turbopack 報錯
  - 現在 client 元件只 import `feature-flag-keys.ts`（無 server 依賴）
  - `Sidebar.tsx` / `BottomNav.tsx` 的 `import type { FeatureFlags }` 同步改為 `feature-flag-keys.ts`

## [0.2.32] - 2026-04-07

### Fixed
- 手機版 BottomNav「更多」面板補上「專案」與「個人設定」連結，與桌面版 Sidebar 功能對齊

## [0.2.31] - 2026-04-06

### Fixed
- Sidebar / BottomNav 語言切換：`supabase.update().catch()` 改用 `Promise.resolve(...).catch()`，修正 PostgREST builder 不實作 `.catch()` 導致的 runtime 錯誤

## [0.2.30] - 2026-04-06

### Added
- 功能開關系統（Feature Flags）
  - Admin 系統設定頁新增「功能開關」區塊，支援 toggle 開啟/關閉各功能模組
  - 9 個可控功能：出勤、請假、加班、薪資、文件、公告、合約、專案、意見回饋
  - 預設：意見回饋開放，其餘關閉（待測試後由管理員手動開啟）
  - Admin 不受開關限制，永遠可存取所有功能
- Sidebar / BottomNav 自動隱藏已關閉的功能連結
- 各功能頁 route 層保護：非 admin 直接打 URL 也會 redirect 回首頁

## [0.2.29] - 2026-04-06

### Added
- 說明文件頁面新增「使用者功能矩陣」表格
  - 6 個功能分區：出勤、請假/加班、薪資、文件管理、公告/合約、專案/其他
  - 4 種角色權限：一般員工、主管、HR、系統管理員
  - 三語言完整支援（zh-TW/en/ja）
  - ✓ 完整存取 / △ 部分存取 / — 無存取，顏色視覺化標示

## [0.2.28] - 2026-04-06

### Fixed
- 語言切換 DB update 加 `.catch(() => {})`，Supabase reject 時不阻擋 navigation

## [0.2.27] - 2026-04-06

### Fixed
- Sidebar / BottomNav 語言切換 DB update 改為 `Promise.race` + 2 秒 timeout，避免 Supabase 慢或失敗時卡住

## [0.2.26] - 2026-04-05

### Fixed
- Cookie `secure` flag 改為 `process.env.NODE_ENV === 'production'`，本機開發（HTTP）不再失效
- BottomNav 語言切換 DB update 改為 `await`，確保寫入完成再跳轉

## [0.2.25] - 2026-04-05

### Added
- 新增說明文件頁面 `/help`（登入後可存取，三語言完整內容）
  - 11 個功能模組說明：儀表板、文件、公告、合約、出勤、請假、加班、薪資、專案、回饋、設定
  - 每個模組包含功能說明、主要功能列表、存取權限說明
  - 點擊模組標題可直接跳轉至對應功能
- Sidebar「其他」區塊新增「說明文件」連結
- 手機版 BottomNav「更多」面板新增「說明文件」

### Fixed
- BottomNav 語言切換補上 DB 同步（與 Sidebar 行為一致）
- Cookie 補上 `secure: true`（`/api/locale` 與 `/api/auth/callback`）
- `LANGUAGES` 常數統一定義於 `src/i18n/config.ts`，Sidebar / BottomNav / LoginControls / Quick-Start 全部 import
- Quick-Start 頁面：`LOCALE_COOKIE` 改 import from config，不再 hardcode

## [0.2.24] - 2026-04-05

### Added
- 登入頁右上角新增語言切換 + Dark/Light 主題切換（`LoginControls` client component）
- 新增 Quick Start 指南頁面 `/quick-start`（三語言，zh-TW/en/ja 內容完整）
  - 6 步驟說明：開啟系統 → 登入 → Microsoft 驗證 → MFA 設定 → MFA 驗證 → 完成
  - 頁面內語言切換（無需登入）
  - 推薦驗證器 App 說明（Google/Microsoft Authenticator）
- 登入頁底部新增「Quick Start 指南」連結
- `/quick-start` 加入公開路由（不需登入可存取）

### Fixed
- 英文 projects 頁面：`memberCount`/`totalRecords` 改用 ICU plural 格式（"1 member" 而非 "1 members"）

## [0.2.22] - 2026-04-05

### Fixed
- Contracts 表格欄位標題：`contracts.title`（頁面標題）改用獨立 `contracts.nameColumn` key
- DocumentsClient：DB 動態值 `doc_type`/`folder` 改用 guard check，避免 unknown key 觸發 next-intl 報錯
- DocumentDetailClient：audit log `action` 改用 guard check，不在 catalog 內的值 fallback 回原始字串

## [0.2.21] - 2026-04-05

### Fixed
- Projects 頁面補上 i18n：ProjectsClient、ProjectDetail 全部接上 useTranslations()
- 新增 projects 翻譯 key（41 個），三語同步（721 key 總計）

## [0.2.20] - 2026-04-05

### Added
- 深度 i18n 補完：所有剩餘硬編碼中文字串替換為翻譯 key
  - Contracts（合約類型/狀態篩選/到期警告/操作按鈕）
  - Documents（上傳表單/詳情/分類/狀態）
  - Overtime（申請表單/狀態/計算說明）
  - Leave（申請/審核/類型標籤）
  - Payroll（薪資明細/anomalies/年度報告）
  - Feedback（回饋表單）
  - StatusBadge（通用狀態標籤多語系）
  - Admin（settings/users/leave-types/overtime-rates/attendance-anomalies）
- 三語 JSON 全面同步（686 key，zh-TW/en/ja 完全對齊）

## [0.2.19] - 2026-04-05

### Added
- 全站 i18n 接入：39 個 component 全部接上 useTranslations()/getTranslations()
  - Sidebar、BottomNav、Dashboard、Login、MFA setup/verify
  - Settings（主題/語言/MFA）
  - Attendance（打卡/補打卡/團隊總覽）、Leave calendar
  - Announcements（分類標籤/確認狀態）、Contracts、Documents
  - Overtime、Payroll（含 anomalies）、Projects、Feedback
  - StatusBadge（通用狀態標籤）
  - 所有 Admin 頁面（users/departments/companies/leave-types/leave-balances/overtime-rates/insurance-brackets/bonuses/feedback/audit/attendance/settings）
- 三語 JSON 完全同步（zh-TW/en/ja 共 367 key，0 缺漏）

## [0.2.18] - 2026-04-05

### Fixed
- **語言切換根本修復**：所有 component 接上 `useTranslations()` / `getTranslations()`
  - Sidebar：所有導航標籤、section header、aria-label 使用翻譯 key
  - BottomNav：所有導航標籤、theme label、logout 使用翻譯 key
  - Login page：按鈕文字、說明文字使用翻譯 key
  - Dashboard：歡迎訊息、待辦事項、快速入口使用翻譯 key
- 新增翻譯 key：`nav.more`、`nav.themeLight`、`nav.themeDark`（三語言）

## [0.2.17] - 2026-04-05

### Fixed
- 語言切換改用 GET redirect：`/api/locale?lang=en&redirect=/` → server 設 cookie + 302 回原頁
- 最可靠的 cookie 設定方式：瀏覽器處理 Set-Cookie + redirect，不依賴 fetch 或 document.cookie

## [0.2.16] - 2026-04-05

### Fixed
- 語言切換改用 `document.cookie` 直接設定（跟 EDC 完全一樣），不經 API route，不受 middleware 影響

## [0.2.15] - 2026-04-05

### Fixed
- Sidebar 語言切換改回 `window.location.reload()`（`router.refresh()` 不會重新載入 root layout 的 NextIntlClientProvider）

## [0.2.14] - 2026-04-04

### Fixed
- **語言切換根本原因修復**：`/api/locale` 被 proxy.ts middleware 攔截 → 307 redirect to /login，cookie 從未設上。已加入 publicRoutes bypass。

## [0.2.13] - 2026-04-04

### Fixed
- React hydration error #418：useTheme() SSR/client mismatch，加 mounted guard

## [0.2.12] - 2026-04-04

### Fixed
- 語言切換 API 簡化：`/api/locale` 只設 cookie（不動 DB、不需 auth），完全對齊 mycrm
- DB 語言儲存改為 fire-and-forget，不阻塞 cookie 設定

## [0.2.11] - 2026-04-04

### Fixed
- 語言切換重構：對齊 mycrm 的做法
  - Cookie 名改為 `MYOPS_LOCALE`（避免 generic `locale` 衝突）
  - 移除 `Secure` flag（mycrm/EDC 都沒用，會在 HTTP 環境失效）
  - Sidebar 改用 `router.refresh()` 取代 `window.location.reload()`
  - 新增 `src/i18n/config.ts` 統一管理 cookie 名、支援語言、預設值

## [0.2.10] - 2026-04-04

### Fixed
- 語言切換改用 server-side API route（`/api/locale`）設定 cookie，取代不可靠的 `document.cookie`
- 所有語言切換入口統一走同一個 API：Sidebar、BottomNav、Settings、LocaleSync

## [0.2.9] - 2026-04-04

### Added
- Desktop Sidebar: 使用者資訊旁新增登出按鈕（hover 變紅），collapsed 狀態也有 icon
- Mobile BottomNav「更多」面板底部新增「登出」按鈕（紅色文字）

## [0.2.7] - 2026-04-04

### Fixed
- 系統設定頁：key 名稱對齊 DB seed data，加入 catch-all 群組，移除不存在的 description 欄位
- 語言切換：auth callback 登入時同步 locale cookie，避免多餘的 reload
- 所有 locale cookie 統一加 Secure flag（HTTPS 環境）

## [0.2.6] - 2026-04-04

### Fixed
- Leave calendar 月份切換：API 新增 `start/end/calendar` 參數支援，修正切月後資料錯誤
- 公告語言解析：`resolveContent` 正確處理 `zh-TW` → `zh` 對應
- Daily digest 公告計數：加入 `requires_confirmation=true` + `confirmed_at IS NULL` 過濾

## [0.2.5] - 2026-04-04

### Fixed
- 網頁版語言切換：改用 `useLocale()` 判斷當前語言，修正高亮不同步問題

### Added
- 手機版「更多」面板新增 Dark/Light mode 切換按鈕
- 手機版「更多」面板新增語言切換（中文/EN/日本語）

## [0.1.0-alpha.1] - 2026-04-03

### Added
- Initial Next.js 14 project setup (TypeScript, Tailwind CSS, App Router)
- shadcn/ui component library initialized
- Core packages: Supabase SSR, next-intl, next-themes, react-hook-form, zod, sonner, lucide-react
- Supabase client (server + browser)
- Middleware with AAL MFA enforcement
- i18n setup (zh-TW / en / ja)
- Type definitions and hasFeature utility
