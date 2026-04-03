# Tech Stack 預設規格

> 此為所有專案的預設技術棧。開新專案時，確認哪些服務需要替換。
> 如果專案使用不同的 Auth provider 或資料庫，在 PRD 的技術棧章節明確說明差異。

---

## 預設技術棧

| 層級 | 預設選擇 | 常見替換選項 |
|------|---------|------------|
| Framework | Next.js 14（App Router + TypeScript） | — |
| 樣式 | Tailwind CSS + next-themes | — |
| UI 元件 | shadcn/ui（必裝） | — |
| 表單 / 驗證 | react-hook-form + zod（必裝） | — |
| Toast | sonner（必裝） | — |
| 資料庫 | Supabase（PostgreSQL + RLS） | PlanetScale、Neon |
| Auth | Microsoft Azure AD OAuth | Google OAuth、GitHub OAuth、NextAuth |
| Storage | Supabase Storage | S3、Cloudinary |
| 部署 | Vercel | — |
| AI / ML | Google Gemini | OpenAI、Anthropic |
| i18n | next-intl | — |
| 主題 | next-themes | — |
| Icon | lucide-react | — |

---

## 核心套件清單

```json
{
  "dependencies": {
    "@supabase/ssr": "latest",
    "@supabase/supabase-js": "latest",
    "next-themes": "latest",
    "next-intl": "latest",
    "lucide-react": "latest",
    "react-hook-form": "latest",
    "@hookform/resolvers": "latest",
    "zod": "latest",
    "sonner": "latest"
  }
}
```

### shadcn/ui 初始化（必要）

```bash
npx shadcn@latest init
# 選擇：Default style, CSS variables, yes for Tailwind

# 預裝元件
npx shadcn@latest add button input textarea select \
  dialog sheet skeleton badge table card \
  tooltip separator avatar form label
```

---

## 目錄結構規範

```
src/
  app/
    (dashboard)/         ← 登入後的頁面（Layout 包覆）
      layout.tsx
      page.tsx
      settings/
        page.tsx
    api/
      auth/
        callback/
          route.ts
      me/
        route.ts
    login/
      page.tsx
  components/
    ui/
      Tooltip.tsx        ← Radix UI / shadcn Tooltip
  lib/
    supabase.ts          ← Server Component 用
    supabase-browser.ts  ← Client Component 用
  messages/
    zh-TW.json
    en.json
    ja.json
  middleware.ts
```

---

## 資料庫規範

### users 表（所有專案必須包含）

```sql
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  display_name  text,
  role          text not null default 'member',  -- member / admin / super_admin
  theme         text not null default 'light',   -- light / dark
  locale        text not null default 'zh-TW',   -- zh-TW / en / ja
  last_login_at timestamptz,
  created_at    timestamptz default now()
);

alter table users enable row level security;

create policy "users: self read/write" on users
  using (auth.uid() = id)
  with check (auth.uid() = id);
```

### 命名規則

| 項目 | 規則 | 範例 |
|------|------|------|
| 表名 | snake_case 複數 | `contact_tags` |
| 欄位名 | snake_case | `created_at` |
| PK | id (uuid) | `id uuid primary key` |
| FK | `{table_singular}_id` | `contact_id` |
| 時間欄位 | timestamptz | `created_at`, `updated_at` |
| 布林欄位 | `is_` 或 `has_` 前綴 | `is_active`, `has_read` |

---

## 環境變數完整清單

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 網站網域
NEXT_PUBLIC_SITE_URL=https://{your-domain}.com

# 版本 / 署名（Vercel build 時注入）
NEXT_PUBLIC_APP_VERSION=0.1.0
NEXT_PUBLIC_DEPLOY_TIME=
NEXT_PUBLIC_AUTHOR_NAME=坂本

# 說明文件
NEXT_PUBLIC_DOCS_USER_URL=https://{docs-site}/user
NEXT_PUBLIC_DOCS_ADMIN_URL=https://{docs-site}/admin
```

---

## Auth 設定：Microsoft Azure AD

1. Azure Portal > App Registration > 新增 App
2. Redirect URI：`https://{your-domain}.com/api/auth/callback`
3. 開啟 `Mail.Send` permission（若需要寄信功能）
4. Supabase Dashboard > Auth > Providers > Microsoft > 填入 Client ID / Secret
5. 限制網域：在 Supabase Auth 設定 `hd` 參數或在 callback route 驗證 email 網域

### Auth 替換為 Google OAuth 時

```typescript
// 只需改 provider
supabase.auth.signInWithOAuth({ provider: 'google' })
// Supabase Dashboard > Auth > Providers > Google
```

---

## Vercel 部署設定

### 環境變數注入（Build Command）

```bash
# package.json scripts
"build": "echo NEXT_PUBLIC_DEPLOY_TIME=$(date -u +\"%Y-%m-%d %H:%M\") >> .env.production && next build"
```

### 必要的 Vercel 環境變數

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`（設為 Vercel 正式網域）
- `NEXT_PUBLIC_AUTHOR_NAME=坂本`
- `NEXT_PUBLIC_APP_VERSION`（每次發版手動更新，或用 CI 自動注入）
