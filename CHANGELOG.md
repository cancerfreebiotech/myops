# Changelog

All notable changes to this project will be documented in this file.

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
