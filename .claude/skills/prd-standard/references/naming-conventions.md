# Naming Conventions — 命名規範

> 所有專案統一遵守，Code Review 時檢查。

---

## 檔案與資料夾

| 類型 | 規則 | 範例 |
|------|------|------|
| Page 元件 | `kebab-case` 資料夾 + `page.tsx` | `contacts/[id]/page.tsx` |
| 共用元件 | `PascalCase.tsx` | `SidebarFooter.tsx` |
| UI 元件 | `components/ui/PascalCase.tsx` | `components/ui/Tooltip.tsx` |
| API Route | `kebab-case` 資料夾 + `route.ts` | `api/auth/callback/route.ts` |
| Lib 工具 | `camelCase.ts` | `supabase.ts`, `imageProcessor.ts` |
| 語言檔 | `{locale}.json` | `zh-TW.json`, `en.json` |
| 截圖 / 資源 | `{功能}-{說明}-v{版本}.png` | `prompt-editor-variables-v0.2.png` |

---

## TypeScript / JavaScript

| 類型 | 規則 | 範例 |
|------|------|------|
| 變數、函式 | `camelCase` | `getUserById`, `isLoading` |
| 元件、型別、介面 | `PascalCase` | `ContactCard`, `UserRole` |
| 常數 | `SCREAMING_SNAKE_CASE` | `MAX_FILE_SIZE`, `DEFAULT_LOCALE` |
| 布林變數 | `is` / `has` / `can` 前綴 | `isLoading`, `hasError`, `canEdit` |
| 事件處理函式 | `handle` 前綴 | `handleSubmit`, `handleDelete` |
| 非同步函式 | 動詞開頭，描述行為 | `fetchContacts`, `updateUserTheme` |

---

## 資料庫

| 項目 | 規則 | 範例 |
|------|------|------|
| 表名 | `snake_case` 複數 | `users`, `contact_tags` |
| 欄位名 | `snake_case` | `display_name`, `created_at` |
| PK | 固定為 `id uuid` | `id uuid primary key default gen_random_uuid()` |
| FK | `{table_singular}_id` | `contact_id`, `user_id` |
| 時間欄位 | `{動作}_at` timestamptz | `created_at`, `last_login_at` |
| 布林欄位 | `is_` 或 `has_` 前綴 | `is_active`, `has_read` |
| Junction 表 | `{table_a}_{table_b}` | `contact_tags` |

---

## i18n Key

| 層級 | 規則 | 範例 |
|------|------|------|
| 命名空間 | 功能模組名，`camelCase` | `common`, `auth`, `settings` |
| Key | `camelCase` | `signIn`, `saveSuccess` |
| Tooltip | `tooltips.{模組}.{欄位}` | `tooltips.prompt.variable` |
| 錯誤訊息 | `errors.{情境}` | `errors.unauthorized` |

### 語言檔結構慣例

```json
{
  "common": { "save": "儲存", "cancel": "取消" },
  "auth": { "signIn": "登入", "signOut": "登出" },
  "settings": { "theme": "主題", "language": "語言" },
  "tooltips": { "prompt": { "variable": "..." } },
  "errors": { "unauthorized": "無使用權限" }
}
```

---

## Git

| 類型 | 規則 | 範例 |
|------|------|------|
| Branch | `{type}/{描述}` | `feat/prompt-editor`, `fix/dark-mode-input` |
| Commit | `{type}: {描述}` | `feat: add prompt editor`, `fix: input color in dark mode` |
| Tag | `v{MAJOR}.{MINOR}.{PATCH}` | `v0.2.0` |

### Commit type

| type | 使用時機 |
|------|---------|
| `feat` | 新功能 |
| `fix` | Bug 修正 |
| `docs` | 文件更新 |
| `style` | 格式調整（不影響邏輯）|
| `refactor` | 重構（不新增功能、不修 bug）|
| `chore` | 套件升級、CI、設定 |
| `test` | 測試相關 |

---

## TypeScript 型別組織

### 型別檔案位置

| 類型 | 位置 | 範例 |
|------|------|------|
| 全域共用型別 | `src/types/index.ts` | `UserRole`, `Locale` |
| 功能模組型別 | `src/types/{module}.ts` | `src/types/contact.ts` |
| Supabase 自動型別 | `src/types/database.types.ts` | 由 CLI 生成，不手動修改 |
| API 回應型別 | `src/types/api.ts` | `ApiResponse<T>` |
| 表單型別 | 與 schema 同層，用 `z.infer<>` | `ContactFormValues` |

### 命名規則

| 類型 | 規則 | 範例 |
|------|------|------|
| Interface | `PascalCase`，不加 `I` 前綴 | `Contact`, `UserProfile` |
| Type alias | `PascalCase` | `UserRole`, `Locale` |
| Enum | `PascalCase`（優先用 `as const` 物件替代） | `const ROLES = { ... } as const` |
| Zod schema | `camelCase` + `Schema` 後綴 | `contactSchema` |
| Zod infer type | schema 名去掉 `Schema` + `Values` | `ContactFormValues` |
| Generic 型別參數 | 單一大寫字母或描述性名稱 | `T`, `TData`, `TError` |

### Supabase 型別使用

```typescript
// 從自動生成型別取用
import type { Database } from '@/types/database.types'

type Contact = Database['public']['Tables']['contacts']['Row']
type ContactInsert = Database['public']['Tables']['contacts']['Insert']
type ContactUpdate = Database['public']['Tables']['contacts']['Update']
```

### 標準 API 回應型別

```typescript
// src/types/api.ts
export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: string }
```

---

## 環境變數

| 類型 | 規則 | 範例 |
|------|------|------|
| 公開（client 可用）| `NEXT_PUBLIC_` 前綴 | `NEXT_PUBLIC_SUPABASE_URL` |
| 私密（server only）| 無前綴 | `SUPABASE_SERVICE_ROLE_KEY` |
| 描述 | `{服務}_{用途}` 全大寫 | `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN` |
