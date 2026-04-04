# Changelog

All notable changes to this project will be documented in this file.

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
