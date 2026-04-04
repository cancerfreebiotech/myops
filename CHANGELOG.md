# Changelog

All notable changes to this project will be documented in this file.

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
