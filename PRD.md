# PRD：myOPS — 精拓生技營運管理系統

> 供 Claude Code 使用。請先閱讀完整 PRD，理解需求後提出技術架構與任務拆分計畫，確認後再開始實作。

---

## ⚠️ Claude Code 工作守則（請務必遵守）

1. **每個 Task 開始前**，先列出你打算新增或修改的檔案清單，等待人類確認後才開始實作
2. **Task 清單中未提及的現有檔案，不得主動修改**
3. **每完成一個 Task**，告知完成內容，等待確認後再繼續下一個
4. 如對需求有疑問，先提問，不要自行假設

---

## 一、專案概覽

### 1.1 背景

本系統由精拓生技（CancerFree Biotech）開發，為獨立於現有 **myCRM** 之外的新系統，但使用相同技術棧與相同使用者群（`@cancerfree.io` Microsoft AAD 帳號）。

**系統名稱：myOPS（Operations Management System）**

系統分三個模組，共用組織架構為基礎：

| 模組 | 說明 |
|------|------|
| **ORG** | 組織架構管理（基礎，其他模組依賴） |
| **DMS** | 文件管理系統（公告、合約、內部文件） |
| **HR** | 人資管理（打卡、請假、加班、薪資結算） |

### 1.2 與 myCRM 的關係

- **獨立部署**：獨立 repo、獨立 Vercel 專案、獨立 Supabase 專案
- **共用登入**：同樣使用 Microsoft AAD OAuth（`@cancerfree.io`）
- **不共用資料庫**：各自獨立的 Supabase 專案

### 1.3 設計原則（30 人新創適用）

- **簡單優先**：流程不過度複雜，避免為了流程而拖慢效率
- **Dashboard 導向**：登入第一眼看到「我有什麼要處理的」
- **通知不擾民**：Teams Bot 做每日彙整摘要，不逐筆轟炸
- **行動優先**：打卡、請假、公告確認主要在手機完成，RWD 必須好用
- **離職交接友善**：員工離職時可快速列出名下合約、專案、待審項目

---

## 二、技術棧規格

```
Framework:    Next.js 14（App Router + TypeScript + Tailwind CSS）
Database:     Supabase PostgreSQL（+ RLS）
Storage:      Supabase Storage
Auth:         Supabase Auth + Microsoft AAD OAuth（限 @cancerfree.io）
Deploy:       Vercel
i18n:         next-intl（zh-TW / en / ja）
UI:           Tailwind CSS + shadcn/ui
Icons:        lucide-react
Forms:        react-hook-form + zod
Toast:        sonner
Calendar:     Microsoft Graph API（Outlook Calendar 整合）
Bot:          Microsoft Teams Bot（沿用 myCRM Dr.Ave）
AI/ML:        Google Gemini API（公告 / 規章多語自動翻譯）
```

### 目錄結構

```
src/
  app/
    (dashboard)/          ← 登入後頁面（Layout 包覆，受 middleware 保護）
      layout.tsx
      page.tsx            ← Dashboard
      ...
    api/
      auth/callback/route.ts
    login/page.tsx
    mfa/
      setup/page.tsx
      verify/page.tsx
  components/
    ui/                   ← shadcn/ui 元件
  lib/
    supabase.ts           ← Server Component 用（service role 或 anon）
    supabase-browser.ts   ← Client Component 用（anon）
  messages/
    zh-TW.json
    en.json
    ja.json
  middleware.ts
```

### 核心套件

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

---

## 三、使用者與身份系統

### 3.1 登入限制

僅允許 `@cancerfree.io` 網域的 Microsoft AAD 帳號登入。在 `api/auth/callback` 驗證 email 網域，非 `@cancerfree.io` 一律拒絕。

### 3.2 角色定義

```typescript
type Role = 'member' | 'admin'

export function hasFeature(
  role: string,
  grantedFeatures: string[],
  feature: FeatureKey
): boolean {
  if (role === 'admin') return true
  return grantedFeatures.includes(feature)
}
```

`admin` = 最高權限，一般使用者透過 `granted_features` 陣列授予特定功能。

### 3.3 granted_features 完整清單

| Key | 說明 | 適用模組 |
|-----|------|---------|
| `publish_announcement` | 可發布公告/規章 | DMS |
| `approve_contract` | 可審核合約（限本部門或代理審核） | DMS |
| `export_signatures` | 可匯出簽署清單（.xlsx） | DMS |
| `view_internal_dept` | 可查看特定部門內部文件 | DMS |
| `hr_manager` | HR 主管：審核一級主管請假、管理假別、管理薪資設定 | HR |
| `finance_payroll` | 財務：查看已核准加班紀錄、結算薪資、上傳勞健保級距表 | HR |
| `coo_notify` | 營運長：接收合約入庫通知、專案加班超額通知 | ORG |
| `manage_projects` | 可建立專案活動、指定專案負責人 | HR |

### 3.4 MFA 強制流程

- 所有使用者登入後強制設定 MFA（Supabase 內建 TOTP）
- Middleware 檢查 AAL：
  - 無 factor → `/mfa/setup`
  - aal1 → `/mfa/verify`
  - aal2 → 正常進入
- **2FA 簽核 Session 寬限期**：簽核動作（審核、確認已讀等）需 2FA 驗證，預設寬限 10 分鐘（`system_settings.mfa_approval_session_minutes`），寬限期內多筆簽核只需驗證一次

### 3.5 簽核鏈定義

| 員工身分 | manager_id 指向 | 請假簽核人 | 合約簽核人 |
|---------|----------------|-----------|-----------|
| 一般員工 | 直屬主管 | 直屬主管 | 直屬主管（需有 `approve_contract`） |
| 一級主管（含營運長） | CEO 或 NULL | HR（`hr_manager`） | deputy_approver_id |
| CEO | NULL | CEO 指定的人 | CEO 指定的人 |

**一人部門**：如果部門只有主管一人，該主管自動走一級主管規則（送 HR / deputy_approver_id）。

---

## 四、資料庫結構

> 所有重要資料表使用軟刪除：`deleted_at TIMESTAMPTZ DEFAULT NULL`、`deleted_by UUID REFERENCES users(id)`。查詢一律加 `WHERE deleted_at IS NULL`。

### 4.1 ORG 模組

```sql
-- 部門
CREATE TABLE departments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  code       TEXT UNIQUE NOT NULL,  -- BD / LAB / HR / SAL / MKT / IT / OM
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

INSERT INTO departments (name, code) VALUES
  ('業務開發', 'BD'), ('實驗室', 'LAB'), ('人資', 'HR'),
  ('業務', 'SAL'), ('行銷', 'MKT'), ('資訊', 'IT'), ('營運', 'OM');

-- 使用者
CREATE TABLE users (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id),
  email              TEXT UNIQUE NOT NULL,
  display_name       TEXT,
  department_id      UUID REFERENCES departments(id),
  role               TEXT DEFAULT 'member',         -- 'member' | 'admin'
  granted_features   TEXT[] DEFAULT '{}',
  employment_type    TEXT DEFAULT 'full_time',       -- 'full_time' | 'intern'
  work_region        TEXT DEFAULT 'TW',              -- 'TW' | 'JP' | 'US' | 'OTHER'
  manager_id         UUID REFERENCES users(id),      -- 直屬主管
  deputy_approver_id UUID REFERENCES users(id),      -- 代理審核人（CEO 指定）
  job_title          TEXT,
  is_active          BOOLEAN DEFAULT TRUE,           -- FALSE = 離職
  language           TEXT DEFAULT 'zh-TW',
  theme              TEXT DEFAULT 'light',
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 員工人事資料
CREATE TABLE user_profiles (
  user_id            UUID PRIMARY KEY REFERENCES users(id),
  hire_date          DATE,
  termination_date   DATE,
  id_number          TEXT,                           -- 身分證字號（加密儲存）
  birth_date         DATE,
  phone              TEXT,
  address            TEXT,
  emergency_contact  TEXT,
  emergency_phone    TEXT,
  bank_code          TEXT,
  bank_account       TEXT,                           -- 銀行帳號（加密儲存）
  labor_pension_self NUMERIC(3,1) DEFAULT 0,         -- 勞退自提比例 0-6%
  monthly_salary     NUMERIC(12,2),                  -- 月薪（full_time）
  hourly_rate        NUMERIC(8,2),                   -- 時薪（intern）
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_by         UUID REFERENCES users(id)
);
```

### 4.2 DMS 模組

```sql
-- 公司主檔
CREATE TABLE companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  aliases    TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 文件主表
CREATE TABLE documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL,           -- 原始語言標題
  title_en              TEXT,                    -- 英文標題（AI 翻譯或手動填寫）
  title_ja              TEXT,                    -- 日文標題（AI 翻譯或手動填寫）
  doc_type              TEXT NOT NULL,
    -- 'ANN' | 'REG' | 'NDA' | 'MOU' | 'CONTRACT' | 'AMEND' | 'INTERNAL'
  folder                TEXT NOT NULL,
    -- 'shared' | 'contracts' | 'internal' | 'archived'
  department_id         UUID REFERENCES departments(id),
  company_id            UUID REFERENCES companies(id),
  related_doc_id        UUID REFERENCES documents(id),
  -- 公告 / 規章純文字內容（三語）；合約類為 NULL，內容在 file_url
  content_source_lang   TEXT DEFAULT 'zh-TW',   -- 原始撰寫語言
  content_zh            TEXT,
  content_en            TEXT,
  content_ja            TEXT,
  ai_translated         BOOLEAN DEFAULT FALSE,   -- 是否使用 AI 自動翻譯
  file_url              TEXT,
  file_name             TEXT,
  file_size             INTEGER,
  expires_at            DATE,
  owner_id              UUID REFERENCES users(id),
  uploaded_by           UUID REFERENCES users(id),
  status                TEXT DEFAULT 'pending',
    -- 'pending' | 'approved' | 'rejected' | 'archived' | 'expired'
  approved_by           UUID REFERENCES users(id),
  approved_at           TIMESTAMPTZ,
  reject_reason         TEXT,
  announcement_category TEXT,  -- 'hr' | 'admin' | 'regulation' | 'urgent'
  reminder_days         INTEGER,
  reminder_until        TEXT DEFAULT 'all_confirmed',  -- 'all_confirmed' | 'date'
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  deleted_by            UUID REFERENCES users(id)
);

-- 文件確認紀錄（公告已讀）
CREATE TABLE document_confirmations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  mfa_verified BOOLEAN DEFAULT TRUE,
  UNIQUE(document_id, user_id)
);

-- 公告確認對象
CREATE TABLE document_recipients (
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  PRIMARY KEY (document_id, user_id)
);

-- 稽核紀錄（不可刪除，保存 5 年）
CREATE TABLE audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id     UUID REFERENCES documents(id),
  user_id    UUID REFERENCES users(id),
  action     TEXT NOT NULL,
    -- 'upload' | 'approve' | 'reject' | 'confirm' | 'archive' | 'restore' | 'download'
  detail     JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 HR — 打卡

```sql
CREATE TABLE attendance_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  clock_date    DATE NOT NULL,
  clock_in      TIMESTAMPTZ,
  clock_out     TIMESTAMPTZ,
  clock_in_lat  NUMERIC(10,7),
  clock_in_lng  NUMERIC(10,7),
  clock_out_lat NUMERIC(10,7),
  clock_out_lng NUMERIC(10,7),
  is_auto_in    BOOLEAN DEFAULT FALSE,
  is_auto_out   BOOLEAN DEFAULT FALSE,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, clock_date)
);

CREATE TABLE work_schedules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO work_schedules (name, start_time, end_time, is_default) VALUES
  ('標準班', '09:00', '18:00', TRUE);
```

### 4.4 HR — 請假

```sql
CREATE TABLE leave_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_zh             TEXT NOT NULL,
  name_en             TEXT NOT NULL,
  name_ja             TEXT NOT NULL,
  applicable_to       TEXT DEFAULT 'all',   -- 'full_time' | 'intern' | 'all'
  salary_ratio        NUMERIC(3,2) DEFAULT 1.0,
  advance_days        INTEGER DEFAULT 0,
  quota_type          TEXT DEFAULT 'fixed', -- 'fixed' | 'by_seniority' | 'unlimited' | 'monthly'
  default_quota_days  NUMERIC(5,1),
  requires_attachment BOOLEAN DEFAULT FALSE,
  attachment_note     TEXT,
  sort_order          INTEGER DEFAULT 0,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leave_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  leave_type_id UUID REFERENCES leave_types(id),
  year          INTEGER NOT NULL,
  total_days    NUMERIC(5,1) NOT NULL,
  used_days     NUMERIC(5,1) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_by    UUID REFERENCES users(id),
  UNIQUE(user_id, leave_type_id, year)
);

CREATE TABLE leave_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id),
  leave_type_id    UUID REFERENCES leave_types(id),
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  start_half       TEXT DEFAULT 'full',  -- 'full' | 'morning' | 'afternoon'
  end_half         TEXT DEFAULT 'full',
  total_days       NUMERIC(5,1) NOT NULL,
  reason           TEXT,
  deputy_user_id   UUID REFERENCES users(id),
  attachment_url   TEXT,
  status           TEXT DEFAULT 'pending',
    -- 'pending' | 'approved' | 'rejected' | 'cancelled'
  approved_by      UUID REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  reject_reason    TEXT,
  outlook_event_id TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.5 HR — 加班

```sql
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  project_lead_id UUID REFERENCES users(id),
  start_date      DATE,
  end_date        DATE,
  status          TEXT DEFAULT 'active',  -- 'active' | 'completed' | 'cancelled'
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE project_members (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE overtime_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_zh     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  name_ja     TEXT NOT NULL,
  rate        NUMERIC(4,2) NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id)
);

INSERT INTO overtime_rates (name_zh, name_en, name_ja, rate, description, sort_order) VALUES
  ('平日加班 前2小時', 'Weekday OT first 2hrs', '平日残業 最初2時間', 1.34, '月薪 ÷ 30 ÷ 8 × 1.34', 1),
  ('平日加班 後2小時', 'Weekday OT next 2hrs', '平日残業 次の2時間', 1.67, '月薪 ÷ 30 ÷ 8 × 1.67', 2),
  ('休息日 前2小時', 'Rest day OT first 2hrs', '休日残業 最初2時間', 1.34, '', 3),
  ('休息日 2-8小時', 'Rest day OT 2-8hrs', '休日残業 2-8時間', 1.67, '', 4),
  ('休息日 8小時以上', 'Rest day OT over 8hrs', '休日残業 8時間超', 2.67, '', 5),
  ('國定假日', 'National holiday', '祝日', 2.00, '加倍發給', 6);

CREATE TABLE overtime_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id),
  request_type     TEXT NOT NULL,  -- 'regular' | 'project'
  project_id       UUID REFERENCES projects(id),
  ot_date          DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  hours            NUMERIC(4,1) NOT NULL,
  reason           TEXT,
  work_content     TEXT,
  overtime_rate_id UUID REFERENCES overtime_rates(id),
  status           TEXT DEFAULT 'pending',
    -- 'pending' | 'lead_approved' | 'coo_approved' | 'approved' | 'rejected'
  approved_by      UUID REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  coo_approved_by  UUID REFERENCES users(id),
  coo_approved_at  TIMESTAMPTZ,
  reject_reason    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.6 HR — 薪資結算

```sql
CREATE TABLE labor_insurance_brackets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_year INTEGER NOT NULL,
  grade          INTEGER NOT NULL,
  insured_salary NUMERIC(10,0) NOT NULL,
  employee_share NUMERIC(10,0) NOT NULL,
  employer_share NUMERIC(10,0) NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by    UUID REFERENCES users(id)
);

CREATE TABLE health_insurance_brackets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_year      INTEGER NOT NULL,
  grade               INTEGER NOT NULL,
  insured_salary      NUMERIC(10,0) NOT NULL,
  employee_share      NUMERIC(10,0) NOT NULL,
  employee_dependents NUMERIC(10,0),
  employer_share      NUMERIC(10,0) NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by         UUID REFERENCES users(id)
);

CREATE TABLE payroll_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES users(id),
  year                 INTEGER NOT NULL,
  month                INTEGER NOT NULL,
  base_salary          NUMERIC(12,2),
  overtime_pay         NUMERIC(12,2) DEFAULT 0,
  bonus                NUMERIC(12,2) DEFAULT 0,
  other_income         NUMERIC(12,2) DEFAULT 0,
  unpaid_leave_deduct  NUMERIC(12,2) DEFAULT 0,
  labor_insurance      NUMERIC(12,2) DEFAULT 0,
  health_insurance     NUMERIC(12,2) DEFAULT 0,
  labor_pension_self   NUMERIC(12,2) DEFAULT 0,
  other_deduction      NUMERIC(12,2) DEFAULT 0,
  gross_pay            NUMERIC(12,2),
  total_deduction      NUMERIC(12,2),
  net_pay              NUMERIC(12,2),
  employer_labor_ins   NUMERIC(12,2) DEFAULT 0,
  employer_health_ins  NUMERIC(12,2) DEFAULT 0,
  employer_pension     NUMERIC(12,2) DEFAULT 0,
  status               TEXT DEFAULT 'draft',
    -- 'draft' | 'hr_reviewed' | 'finance_confirmed' | 'coo_approved' | 'paid'
  hr_reviewed_by       UUID REFERENCES users(id),
  hr_reviewed_at       TIMESTAMPTZ,
  finance_confirmed_by UUID REFERENCES users(id),
  finance_confirmed_at TIMESTAMPTZ,
  coo_approved_by      UUID REFERENCES users(id),
  coo_approved_at      TIMESTAMPTZ,
  anomaly_flags        JSONB,
  note                 TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year, month)
);

CREATE TABLE bonus_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  year        INTEGER NOT NULL,
  month       INTEGER,
  type        TEXT NOT NULL,  -- 'year_end' | 'performance' | 'project' | 'other'
  amount      NUMERIC(12,2) NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.7 系統回饋模組

```sql
CREATE TABLE feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,         -- 'feature_request' | 'bug_report'
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  screenshot_urls TEXT[] DEFAULT '{}',   -- Supabase Storage 路徑，最多 3 張
  submitted_by    UUID REFERENCES users(id),
  status          TEXT DEFAULT 'open',   -- 'open' | 'in_progress' | 'done' | 'rejected'
  admin_note      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.8 系統設定

```sql
CREATE TABLE system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

INSERT INTO system_settings (key, value) VALUES
  ('maintenance_mode', 'false'),
  ('mfa_approval_session_minutes', '10'),
  ('contract_reminder_days_first', '90'),
  ('contract_reminder_days_second', '30'),
  ('default_clock_in_time', '09:00'),
  ('default_clock_out_time', '18:00'),
  ('auto_clock_check_delay_minutes', '30'),
  ('intern_missed_clock_alert_threshold', '3'),
  ('fulltime_auto_clock_alert_days', '3'),
  ('overtime_min_advance_hours', '8'),
  ('project_ot_coo_threshold_hours', '8'),
  ('payroll_pay_day', '5'),
  ('payroll_auto_generate_day', '1'),
  ('daily_digest_time', '08:30'),
  -- AI 翻譯（若 GEMINI_API_KEY 環境變數已設定則優先使用，此欄位作為 fallback）
  ('gemini_api_key', '');
```

---

## 五、環境變數

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 網站網域
NEXT_PUBLIC_APP_URL=https://ops.cancerfree.io

# Microsoft Azure AD（OAuth 登入 + Graph API 共用同一個 App Registration）
# 需開啟 scope：openid / profile / email / Calendars.ReadWrite
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=

# Teams Bot
TEAMS_BOT_APP_ID=
TEAMS_BOT_APP_SECRET=

# 版本 / 署名（Vercel build 時注入）
NEXT_PUBLIC_APP_VERSION=0.1.0-alpha.1
NEXT_PUBLIC_DEPLOY_TIME=
NEXT_PUBLIC_AUTHOR_NAME=坂本

# 說明文件
NEXT_PUBLIC_DOCS_USER_URL=
NEXT_PUBLIC_DOCS_ADMIN_URL=

# AI 翻譯（優先使用；未設定時 fallback 至 system_settings.gemini_api_key）
GEMINI_API_KEY=
```

**Vercel Build Command（注入部署時間）：**

```bash
echo NEXT_PUBLIC_DEPLOY_TIME=$(date -u +"%Y-%m-%d %H:%M") >> .env.production && next build
```

---

## 六、功能規格

### 6.1 認證流程

```
使用者點擊「登入」
  → Supabase Auth Microsoft OAuth
  → /api/auth/callback 驗證 email 網域（非 @cancerfree.io → 拒絕）
  → 建立 users 記錄（首次登入）
  → Middleware 檢查 MFA AAL：
      無 factor → /mfa/setup（TOTP 設定）
      aal1      → /mfa/verify（輸入 TOTP code）
      aal2      → 進入 Dashboard
```

閒置 30 分鐘自動登出（Supabase Session 設定）。

### 6.2 主題系統（Dark / Light Mode）

> 視覺規則完整定義於 `design-system/myops/MASTER.md`。

- 套件：`next-themes`
- 使用者偏好存於 `users.theme`，登入後自動套用
- 個人設定頁可切換，即時更新

### 6.3 多國語言（i18n）

- 套件：`next-intl`
- 語言：`zh-TW`（預設）/ `en` / `ja`
- 語言檔：`src/messages/{locale}.json`
- 使用者偏好存於 `users.language`
- **禁止在元件內 hardcode 任何語言字串**
- i18n namespace 必須對應：頁面用 `useTranslations('xxx')` 就必須有 `xxx` namespace，否則顯示 raw key
- Tooltip 文字放在 `tooltips.*` 命名空間

### 6.4 Footer — 署名與部署時間

固定格式：
```
坂本  |  v{version}  |  Deployed: {YYYY-MM-DD HH:mm}
```

由環境變數提供：`NEXT_PUBLIC_AUTHOR_NAME`、`NEXT_PUBLIC_APP_VERSION`、`NEXT_PUBLIC_DEPLOY_TIME`。

### 6.5 Tooltip / ? 說明提示系統

- 使用 shadcn/ui `Tooltip` 元件
- 複雜欄位（如 granted_features、勞退自提比例）旁放 `?` icon，hover 顯示說明
- Tooltip 文字納入 i18n（`tooltips.*` namespace）
- 行動裝置改為 tap 觸發

### 6.6 說明文件規範

- 分層：外部 User（公開）vs 內部 Admin（需登入）
- 三語：zh-TW 主語言，en / ja 隨後跟進
- Dashboard Header 依 `users.language` 自動帶到對應語言版本
- 連結透過環境變數：`NEXT_PUBLIC_DOCS_USER_URL` / `NEXT_PUBLIC_DOCS_ADMIN_URL`

### 6.7 行動裝置支援（Mobile-first RWD）

> 詳細視覺規則見 `design-system/myops/MASTER.md`。

- 最低支援：iOS Safari 16+、Android Chrome 110+
- 觸控目標 ≥ 44×44px
- input/select 字型 ≥ 16px（防 iOS 自動縮放）
- 禁止 hover-only 互動
- Sidebar 在手機收折為 Drawer
- 打卡、請假申請、公告確認在手機必須順暢完成

### 6.8 ORG 模組

**部門管理（`/admin/departments`）：**
- Admin 可新增/修改部門，代號不可重複

**使用者管理（`/admin/users`）：**
- 設定部門、角色、granted_features、manager_id、deputy_approver_id、employment_type、work_region
- 停用帳號（`is_active = false`）時自動列出名下：合約、未結案專案、待審項目 → 提醒交接

**員工人事資料（`user_profiles`）：**
- HR + Admin 可編輯，員工僅可查看自己的
- 敏感欄位（id_number、bank_account）加密儲存

### 6.9 DMS 模組

**資料夾結構（管理員預建，員工不得新增資料夾）：**

| 資料夾 | 類型代號 | 說明 |
|--------|---------|------|
| 01_全公司共用 | ANN / REG | 公告、規章，全員可讀 |
| 02_外部合約 | NDA / MOU / CONTRACT / AMEND | 依公司名建子資料夾 |
| 03_內部文件 | INTERNAL | 依部門分子資料夾；免審核直接入庫 |
| 04_封存 | ARCHIVED | 手動封存；僅 Admin 可查閱 |

**公告/規章審核流程：**
```
有 publish_announcement 權限的使用者發布
  → 填寫標題與內文（選擇撰寫語言：zh-TW / en / ja）
  → 選分類（hr / admin / regulation / urgent）
  → 選確認對象（預設全公司，可指定特定人員）
  → 設定提醒頻率（每 X 天）
  → [可選] 點擊「AI 自動翻譯」
      → 呼叫 /api/translate
      → Gemini 翻譯為另外兩語，填入預覽欄位
      → 發布者可手動修改任一語言後確認
  → 確認發布
  → 入庫（ai_translated = true/false 記錄是否使用翻譯）
  → 通知所有確認對象
  → 收件人需 2FA 確認已讀（受 session 寬限期保護）
  → Teams Bot 依設定頻率提醒未確認者
  → 離職（is_active=false）自動排除提醒
```

**公告詳情頁多語顯示：**
依 `users.language` 自動顯示對應語言版本（content_zh / content_en / content_ja）。若該語言版本為空，fallback 顯示原始語言並標注「此版本尚未翻譯」。

**合約審核流程：**
```
員工上傳（填到期日、負責人、關聯公司）
  → 系統提示：「同公司有 X 份文件，是否關聯？」
  → 主管審核（需 2FA，依簽核鏈）
    → 通過：入庫 + 通知上傳者 + 通知營運長（純告知）
    → 退回：通知上傳者 + 附退回原因
```

**內部文件（INTERNAL）：免審核，上傳即入庫。**

**合約到期提醒：**

| 時間點 | 通知對象 | 管道 |
|--------|---------|------|
| 到期前 90 天 | 合約負責人 | Teams Bot + 系統通知 |
| 到期前 30 天 | 合約負責人 | 再次通知 |
| 到期當日 | 負責人 + Admin | 狀態標記 expired |
| 到期後 | — | 不自動封存，由 Admin / 主管 / 負責人手動封存 |

**公告分類：**

| key | 名稱 | 說明 |
|-----|------|------|
| `hr` | 人事公告 | 人員異動、招募 |
| `admin` | 行政公告 | 行政事務 |
| `regulation` | 法規/規章 | 公司規章、法規更新 |
| `urgent` | 緊急通知 | 緊急事項（立即通知） |

**公司主檔管理（`/admin/companies`）：**
- Admin 可建立/修改/合併，支援別名避免同公司不同寫法分開

### 6.10 HR — 打卡系統

**打卡方式：**

| 管道 | 說明 |
|------|------|
| 網頁打卡 | 瀏覽器 Geolocation API 取得 GPS 座標 |
| Teams Bot | Bot 發提醒 + 打卡按鈕，點擊後跳轉網頁完成打卡 |

**GPS 策略：記錄但不限制。** v0.1 不做地理圍欄限制。

**自動打卡規則：**

| | Full-time | Intern |
|---|-----------|--------|
| 上班打卡 | 忘了系統自動補 09:00（標記「系統自動」） | 必須手動打 |
| 下班打卡 | 忘了系統自動補 18:00（標記「系統自動」） | 必須手動打 |
| 自動時機 | 每日排程（09:30 / 18:30 檢查） | 無 |

**異常紀錄 Dashboard（HR 可見）：**
- Full-time 連續 3 天以上都是系統自動打卡 → 標記提醒
- Intern 月忘打卡超過 3 次 → 通知 HR

**補打卡：**
```
員工提交補打卡申請（日期、時間、原因）
  → 直屬主管審核（需 2FA）
  → 通過：更新打卡紀錄
```

### 6.11 HR — 請假系統

**預設假別：**

| 假別 | 適用 | 提前天數 | 薪資 | 額度 |
|------|------|---------|------|------|
| 特休 | full_time | 7 天 | 全薪 | 依年資（HR 設定） |
| 事假 | all | 1 天 | 無薪 | 14 天/年 |
| 病假 | full_time | 0（事後） | 半薪 | 30 天/年 |
| 婚假 | full_time | 7 天 | 全薪 | 8 天 |
| 喪假 | full_time | 0 | 全薪 | 依親等 3-8 天 |
| 產假 | full_time | 7 天 | 全薪 | 8 週 |
| 陪產假 | full_time | 7 天 | 全薪 | 7 天 |
| 公假 | full_time | 1 天 | 全薪 | 無上限 |
| 生理假 | full_time | 0 | 無薪 | 每月 1 天 |

最小單位：**半天**（上半天 / 下半天）。實習生只能請事假。HR 可新增自訂假別。

**請假流程：**
```
員工提交請假申請（假別、起迄、半天/全天、原因、職務代理人、附件）
  → 系統檢查：提前天數、剩餘額度
  → 簽核（需 2FA，依簽核鏈）
  → 通過：同步 Outlook Calendar + 扣除額度 + 通知申請人
  → 退回：通知申請人 + 附原因
```

**Outlook Calendar 整合：**
- 核准後自動建立事件，標題：`[請假] {姓名} - {假別}`，設為「外出」狀態
- 技術：Microsoft Graph API（AAD OAuth token）

**團隊請假日曆（`/leave/calendar`）：**
- 主管看全部門，員工看同部門，Admin 看全公司

### 6.12 HR — 加班系統

**一般加班（平日）：**
```
員工提前 8 小時提交加班申請（日期、時段、原因）
  → 直屬主管審核（需 2FA）
  → 通過後員工於該時段手動打卡（標記為加班）
```

**專案加班（週末/特殊專案）：**
```
專案成員填寫加班時數（日期、時段、工作內容）
  → 專案負責人審核（需 2FA）
  → 營運長被通知（純告知）
  → 若單筆超過門檻（預設 8 小時），營運長需額外核准
  → 財務（finance_payroll）查看已核准紀錄結算加班費
```

**加班適用區域：**

| 功能 | TW | JP / US / OTHER |
|------|-----|-----------------|
| 加班申請 | ✅ | ✅（紀錄但不算費用） |
| 加班費率計算 | ✅ | ❌ |
| 加班費結算 | ✅ | ❌ |

### 6.13 HR — 薪資結算（TW only）

**薪資結構：**

```
Full-time 實發 = 月薪 + 加班費 - 無薪假扣款 - 勞保個人負擔 - 健保個人負擔 - 勞退自提
Intern 實發   = 時薪 × 當月總工時 - 勞保個人負擔 - 健保個人負擔
```

**結算流程：**
```
每月 1 號：系統自動產出薪資草稿
  → 計算：底薪、加班費、無薪假扣款、勞健保
  → 標記異常項目
  → HR 檢查調整（hr_manager）
  → 財務確認（finance_payroll）
  → 營運長核准（coo_notify）
  → 每月 5 號（可調整）發薪
  → 產出薪資明細，員工可查看自己的
```

**異常自動標記：**
- 加班時數超過月 46 小時（勞基法上限）
- 無薪假天數異常
- 薪資與上月差異超過 20%
- 新進 / 離職員工（需按比例計算）

**勞健保級距表：**
財務（`finance_payroll`）每年上傳最新 Excel，系統解析後寫入 DB。

### 6.14 系統回饋模組（Feedback）

- 全員可從右下角浮動按鈕（或 Sidebar 連結）進入 `/feedback/new`
- 類型：`feature_request`（功能需求）/ `bug_report`（Bug 回報，可附截圖最多 3 張）
- **送出後直接顯示成功，不跳確認彈窗，不發通知給使用者**
- 截圖存於 `feedback-screenshots` bucket，使用 signed URL
- Admin 可在 `/admin/feedback` 管理狀態、寫備註、預覽截圖

### 6.15 Teams Bot 整合

沿用 myCRM Dr.Ave，新增 myOPS 功能。

**每日彙整（早上 08:30，不逐筆轟炸）：**
```
📋 你今天有 3 件待處理：
1. ⏰ 2 筆請假待審核
2. 📄 1 份合約待審核
👉 前往 myOPS 處理：[連結]
```

**即時通知（僅重要事項）：**

| 情境 | 即時性 |
|------|--------|
| 審核結果（核准/退回） | 即時 |
| 緊急公告（urgent） | 即時 |
| 薪資單產出 | 即時 |
| 合約到期提醒 | 每日彙整 |
| 公告未確認提醒 | 每日彙整 |
| 打卡提醒 | 排程 |

**Bot 語言判斷：** `users.language` → Teams `locale` → Fallback 中文

### 6.16 系統設定（`/admin/settings`）

全部可調參數集中管理，見 `system_settings` 表（4.8 節）。

---

## 七、頁面與 UI 規格

> 視覺設計規則（色彩、字型、元件樣式）詳見 `design-system/myops/MASTER.md`。

```
/                              → Dashboard（待辦事項、到期合約、未確認公告、今日打卡狀態）

# DMS
/documents                     → 文件列表（搜尋、篩選、分類）
/documents/[id]                → 文件詳情（含稽核紀錄）
/announcements                 → 公告歸檔頁（全員可查看歷史公告）
/announcements/[id]            → 公告詳情 + 確認已讀（需 2FA）
/contracts                     → 合約列表（含負責人狀態篩選、到期篩選）
/contracts/[id]                → 合約詳情（含關聯文件、到期資訊）

# HR — 打卡
/attendance                    → 我的打卡紀錄 + 打卡按鈕
/attendance/team               → 部門打卡總覽（主管可見）

# HR — 請假
/leave                         → 我的請假紀錄 + 申請請假
/leave/calendar                → 團隊請假日曆（同部門）
/leave/approvals               → 待審核請假（主管 / HR）

# HR — 加班
/overtime                      → 我的加班紀錄 + 申請加班
/overtime/approvals            → 待審核加班（主管）
/projects                      → 專案列表
/projects/[id]                 → 專案詳情 + 成員加班紀錄
/projects/[id]/overtime        → 專案加班填報

# HR — 薪資
/payroll                       → 我的薪資單（員工查看）
/payroll/annual                → 年度 Total Compensation 彙總

# MFA
/mfa/setup                     → MFA 首次設定
/mfa/verify                    → MFA 登入驗證

# 個人設定
/settings                      → 個人設定（語言、主題、MFA、勞退自提比例）

# 管理後台
/admin/users                   → 使用者管理（含人事資料）
/admin/departments             → 部門管理
/admin/companies               → 公司主檔
/admin/audit                   → 稽核紀錄
/admin/settings                → 系統設定
/admin/leave-types             → 假別管理（HR）
/admin/overtime-rates          → 加班費率管理（HR）
/admin/insurance-brackets      → 勞健保級距表上傳（財務）
/admin/payroll                 → 薪資結算作業（HR → 財務 → 營運長）
/admin/payroll/anomalies       → 薪資異常檢查
/admin/attendance              → 全公司打卡紀錄（HR / Admin）
/admin/feedback                → 回饋管理（Admin 限定）

# 回饋
/feedback/new                  → 提交回饋（全員）
```

**共用 UI 規範：**
- 列表頁：PAGE_SIZE = 20，分頁元件含跳頁輸入框
- 列表支援關鍵字搜尋 + 多維度篩選
- 破壞性操作必須有確認 Dialog
- Loading 使用 Skeleton 元件（配合 Suspense）
- 通知使用 sonner toast
- 表單：zod schema + react-hook-form

---

## 八、API 規格

### 8.1 Client 使用規則

| 位置 | 使用的 Client | 說明 |
|------|-------------|------|
| API Route（`src/app/api/`） | **service role client** | 繞過 RLS，完整權限 |
| Server Component | **service role client** 或 anon（視需求） | |
| Client Component | **anon client** | 受 RLS 限制 |

### 8.2 回應格式

所有 API route 一律回傳：

```typescript
// 成功
{ data: T }

// 失敗
{ error: string }
```

HTTP 狀態碼：`200` 成功，`400` 參數錯誤，`401` 未登入，`403` 權限不足，`500` 伺服器錯誤。

### 8.3 檔案上傳

**禁止透過 Vercel API Route 上傳檔案**（上限 4.5MB）。

標準流程：
```
前端 → POST /api/storage/presigned（取得 Presigned Upload URL）
     → 直接從瀏覽器上傳到 Supabase Storage（繞過 Vercel）
     → POST /api/{resource}（上傳完成後通知 API 建立 DB 記錄）
```

Storage bucket：

| Bucket | 用途 | 存取方式 |
|--------|------|---------|
| `documents` | 合約、公告附件 | signed URL |
| `feedback-screenshots` | 回饋截圖 | signed URL |
| `insurance-brackets` | 勞健保級距 Excel | service role only |

**禁止使用 public URL**，一律使用 signed URL（避免快取問題）。

### 8.4 Microsoft Graph API

```
POST /api/calendar/leave-event        → 建立請假 Outlook Calendar 事件
DELETE /api/calendar/leave-event/[id] → 取消請假時刪除事件
```

需從 Supabase Auth session 取得 Microsoft OAuth token（AAD 登入時已取得）。

### 8.5 AI 翻譯 API

```
POST /api/translate
```

**Request：**
```typescript
{
  source_lang: 'zh-TW' | 'en' | 'ja',
  target_langs: ('zh-TW' | 'en' | 'ja')[],
  fields: {
    title: string,
    content: string
  }
}
```

**Response：**
```typescript
{
  data: {
    'en': { title: string, content: string },
    'ja': { title: string, content: string }
    // 依 target_langs 返回
  }
}
```

**實作規則：**
- API Key 優先讀取 `GEMINI_API_KEY` 環境變數；若未設定，從 `system_settings.gemini_api_key` 讀取（service role client）
- **`gemini_api_key` 的值絕對不可傳回前端**，只在 API Route server-side 讀取
- 若兩者皆未設定，回傳 `{ error: 'AI 翻譯功能未設定，請聯繫 Admin' }`
- 翻譯 prompt：要求保留專有名詞、公司名稱、產品名稱不翻譯；語氣保持正式
- 每次翻譯記錄 token 用量至 `audit_logs`（action: `'ai_translate'`）供後續成本追蹤

---

## 九、安全性與 RLS

### 9.1 RLS 基本原則

所有資料表啟用 RLS。以下為主要政策方向（實作時逐表細化）：

| 資料表 | 讀取 | 寫入 |
|--------|------|------|
| `users` | 自己 + Admin + 同部門主管（部分欄位） | 自己（部分欄位）/ Admin |
| `user_profiles` | 自己 + Admin + HR | Admin + HR |
| `documents` | 依 folder / department_id / 角色 | 依 granted_features |
| `audit_logs` | Admin | 系統（service role only） |
| `attendance_records` | 自己 + 主管 + HR + Admin | service role only（自動打卡）/ 自己（手動） |
| `leave_requests` | 自己 + 簽核人 + HR + Admin | 自己（建立）/ 簽核人（審核） |
| `payroll_records` | 自己 + HR + 財務 + Admin | service role only（自動產出）/ HR + 財務 + Admin |
| `feedback` | 自己 + Admin | 自己（建立） |

### 9.2 加密儲存

- `user_profiles.id_number`（身分證字號）
- `user_profiles.bank_account`（銀行帳號）

使用 Supabase Vault 或 pgcrypto，不以明文存放。

### 9.3 稽核紀錄

- `audit_logs` 不可刪除，保存 5 年
- 以下操作必須記錄：upload、approve、reject、confirm、archive、restore、download
- 由 API Route（service role）寫入，前端無直接寫入權限

### 9.4 資料隔離

- 薪資資料（`payroll_records`、`user_profiles.monthly_salary`）：員工只能看自己，HR + 財務可看全部
- 人事敏感資料（`user_profiles`）：員工只能查看自己，HR + Admin 可編輯

### 9.5 常見陷阱

1. **所有 query 加 `WHERE deleted_at IS NULL`**（軟刪除）
2. **Supabase PostgREST max_rows = 1000**：大量資料需分批查詢或用 RPC
3. **MFA 未驗證 factor 清理**：enroll 後未完成驗證的 factor 5 分鐘後自動刪除，需處理此 edge case
4. **Next.js 15 async params**：route params 需要 await，否則某些 API 會 404

---

## 十、主題 / 樣式系統

> 完整規格見 `design-system/myops/MASTER.md`。

實作任何頁面或元件前，必須先讀 `design-system/myops/MASTER.md`。頁面級規格另見 `design-system/myops/pages/[page-name].md`，頁面規格**覆蓋** MASTER。

---

## 十一、非功能需求

| 需求 | 規格 |
|------|------|
| 頁面載入速度 | < 2 秒（正常網路） |
| 單檔上傳上限 | 50 MB（Supabase Storage 直傳） |
| 列表分頁大小 | PAGE_SIZE = 20 |
| 閒置登出 | 30 分鐘 |
| 稽核紀錄保存 | 5 年，不可刪除 |
| 瀏覽器支援 | iOS Safari 16+、Android Chrome 110+、桌面 Chrome/Edge/Firefox 最新 2 版 |
| HTTPS | 全站強制 |
| 檔案加密 | at-rest 加密（Supabase Storage 預設） |
| 敏感欄位 | id_number、bank_account 加密儲存 |
| 可用語言 | zh-TW（主）/ en / ja，三語完整無缺漏 key |

---

## 十二、版本命名與管理規則

格式：`v{MAJOR}.{MINOR}.{PATCH}[-{pre-release}]`

| 變更類型 | 遞增位置 | 範例 |
|---------|---------|------|
| 破壞性變更 | MAJOR | v1.0.0 → v2.0.0 |
| 新增功能 | MINOR | v1.0.0 → v1.1.0 |
| Bug fix / 文件 | PATCH | v1.0.0 → v1.0.1 |

Pre-release：`alpha` → `beta` → `rc` → 正式版

**每次 Push 強制三件事：**
1. `package.json` version 遞增
2. `CHANGELOG.md` 頂部新增當版紀錄（分類：`Added` / `Changed` / `Fixed` / `Removed` / `Security` / `Docs` / `Chore`）
3. `PRD.md` 更新 version + updated 欄位

---

## 十三、開發任務清單（v0.1）

### Phase 1：基礎建設（必須先完成）

- [ ] **Task 1** `[新增]` — 初始化 Next.js 14 專案，設定 TypeScript、Tailwind、ESLint、next-intl、shadcn/ui
- [ ] **Task 2** `[新增]` — Supabase 專案設定：建立所有資料表（ORG + DMS + HR）、RLS 政策、Storage bucket
- [ ] **Task 3** `[新增]` — Microsoft AAD OAuth 登入（沿用 myCRM 相同設定）
- [ ] **Task 4** `[新增]` — MFA 強制設定（`/mfa/setup`、`/mfa/verify`、middleware AAL 檢查、簽核 session 寬限期）
- [ ] **Task 5** `[新增]` — Layout、Sidebar、主題切換（dark/light）、i18n 三語架構、Footer
- [ ] **Task 6** `[新增]` — 使用者管理頁（`/admin/users`）：部門、角色、granted_features、manager_id、deputy_approver_id
- [ ] **Task 7** `[新增]` — 員工人事資料管理（`user_profiles`）：到職日、銀行帳戶、勞退自提等
- [ ] **Task 8** `[新增]` — 部門管理頁（`/admin/departments`）
- [ ] **Task 9** `[新增]` — 公司主檔頁（`/admin/companies`）：新增、編輯、別名管理

### Phase 2：文件管理核心（DMS）

- [ ] **Task 10** `[新增]` — 文件上傳（Presigned URL 直傳）+ 建立 DB 記錄
- [ ] **Task 11** `[新增]` — 文件列表頁（搜尋、篩選、分類）
- [ ] **Task 12** `[新增]` — 合約上傳流程：填寫到期日、負責人、關聯公司；同公司文件提示關聯
- [ ] **Task 13** `[新增]` — 合約審核流程：主管審核（依簽核鏈）、通過/退回通知、通知營運長
- [ ] **Task 14** `[新增]` — 合約列表：負責人狀態篩選 + 到期篩選
- [ ] **Task 15** `[新增]` — 公告發布流程：填寫標題/內文（選語言）、選分類、選確認對象、設提醒頻率、入庫通知
- [ ] **Task 15b** `[新增]` — AI 自動翻譯（`/api/translate`）：呼叫 Gemini、三語預覽、手動修改後確認發布
- [ ] **Task 16** `[新增]` — 公告確認頁（2FA 驗證 + 確認已讀 + 記錄時間戳記）
- [ ] **Task 17** `[新增]` — 公告歸檔頁（全員可查看歷史公告 + 自己的確認狀態）
- [ ] **Task 18** `[新增]` — 公告發布者報表（確認進度、明細、一鍵催人）
- [ ] **Task 19** `[新增]` — 稽核紀錄（不可刪除，每個操作自動記錄）

### Phase 3：打卡系統

- [ ] **Task 20** `[新增]` — 打卡頁面（Web + GPS）+ 打卡 API
- [ ] **Task 21** `[新增]` — 自動打卡排程（Supabase Edge Function）：Full-time 忘打卡自動補
- [ ] **Task 22** `[新增]` — 打卡紀錄頁（個人 + 部門總覽）
- [ ] **Task 23** `[新增]` — 補打卡申請 + 主管審核
- [ ] **Task 24** `[新增]` — 打卡異常 Dashboard（HR 可見）

### Phase 4：請假系統

- [ ] **Task 25** `[新增]` — 假別管理頁（`/admin/leave-types`）：HR 可 CRUD、設定規則
- [ ] **Task 26** `[新增]` — 員工假別額度管理（HR 依年資設定每人特休等額度）
- [ ] **Task 27** `[新增]` — 請假申請頁（選假別、日期、代理人、附件）+ 額度 + 提前天數檢查
- [ ] **Task 28** `[新增]` — 請假簽核流程（依簽核鏈：主管 / HR / CEO 指定人）
- [ ] **Task 29** `[新增]` — 請假核准後同步 Outlook Calendar（Microsoft Graph API）
- [ ] **Task 30** `[新增]` — 團隊請假日曆（`/leave/calendar`）
- [ ] **Task 31** `[新增]` — 請假紀錄 + 取消請假功能

### Phase 5：加班系統

- [ ] **Task 32** `[新增]` — 一般加班申請 + 主管審核（提前 8 小時）
- [ ] **Task 33** `[新增]` — 加班費率管理（`/admin/overtime-rates`）HR 可調整
- [ ] **Task 34** `[新增]` — 專案管理（建立專案、指定負責人、管理成員）
- [ ] **Task 35** `[新增]` — 專案加班填報 + 專案負責人審核 + 營運長超額通知
- [ ] **Task 36** `[新增]` — 加班紀錄頁（個人 + 管理總覽）

### Phase 6：薪資結算（TW only）

- [ ] **Task 37** `[新增]` — 勞健保級距表上傳（`/admin/insurance-brackets`）：Excel 上傳、解析、存 DB
- [ ] **Task 38** `[新增]` — 薪資自動結算引擎：月薪 + 加班費 - 扣款 - 勞健保
- [ ] **Task 39** `[新增]` — 薪資結算流程頁（`/admin/payroll`）：HR → 財務 → 營運長
- [ ] **Task 40** `[新增]` — 薪資異常自動標記 + 異常檢查頁
- [ ] **Task 41** `[新增]` — 員工薪資單頁（`/payroll`）+ 年度 Total Compensation 彙總
- [ ] **Task 42** `[新增]` — 年終獎金 / 額外獎金管理（HR / 財務手動輸入）

### Phase 7：通知整合

- [ ] **Task 43** `[新增]` — Teams Bot 整合：每日彙整通知
- [ ] **Task 44** `[新增]` — Teams Bot：即時通知（審核結果、緊急公告、薪資單）
- [ ] **Task 45** `[新增]` — Teams Bot：打卡提醒（含打卡按鈕連結）
- [ ] **Task 46** `[新增]` — 合約到期自動提醒（Supabase Edge Function + pg_cron）
- [ ] **Task 47** `[新增]` — 公告未確認定期提醒（依設定頻率，排除離職帳號）

### Phase 8：Dashboard + 匯出 + 收尾

- [ ] **Task 48** `[新增]` — Dashboard 首頁：待辦事項、到期合約、未確認公告、今日打卡、請假概況
- [ ] **Task 49** `[新增]` — 簽署清單匯出（.xlsx）：Admin 全公司、有權限者本部門
- [ ] **Task 50** `[新增]` — 稽核紀錄頁（`/admin/audit`）：篩選、搜尋、保存 5 年
- [ ] **Task 51** `[新增]` — 系統設定頁（`/admin/settings`）：所有可調參數集中管理，含 Gemini API Key 設定（masked 顯示，存入 system_settings，server-side only）
- [ ] **Task 52** `[新增]` — 員工離職交接清單（列出名下合約、專案、待審項目）
- [ ] **Task 53** `[新增]` — 系統回饋表單（`/feedback/new`）：新增功能需求 / Bug 回報（含截圖上傳）
- [ ] **Task 54** `[新增]` — 回饋管理後台（`/admin/feedback`）：列表、狀態管理、截圖預覽
- [ ] **Task 55** `[新增]` — i18n 補齊：所有頁面三語（zh-TW / en / ja）完整無缺漏
- [ ] **Task 56** `[新增]` — docs/ 文件：中英日三語版本

---

## 附錄

### A. 從 myCRM 學到的經驗（重要背景）

以下為在 myCRM 開發過程中驗證有效的做法，本系統直接沿用。

**已知陷阱：**
1. i18n namespace 必須對應：頁面用 `useTranslations('xxx')`，語言檔就必須有 `xxx` namespace
2. Supabase PostgREST 預設 max_rows=1000，大量資料需分批查詢或用 RPC
3. Vercel API Route 上傳上限 4.5MB，大檔案必須用 Presigned URL 直傳
4. Storage 圖片 URL：使用 signed URL 而非 public URL，避免快取問題
5. Next.js 15 async params：route params 需要 await，否則某些 API 會 404
6. 軟刪除查詢：所有 query 記得加 `WHERE deleted_at IS NULL`
7. MFA 未驗證 factor 清理：enroll 後未完成驗證的 factor 5 分鐘後自動刪除，需處理此 edge case
8. Teams Bot 語言：所有回覆訊息要支援三語，用語言包統一管理

### B. 功能適用區域對照

| 功能 | TW | JP / US / OTHER |
|------|-----|-----------------|
| 登入 / MFA | ✅ | ✅ |
| DMS 全部功能 | ✅ | ✅ |
| 打卡 | ✅ | ✅ |
| 請假申請 | ✅ | ✅（假別由 HR 設定） |
| 加班申請 | ✅ | ✅（紀錄但不自動算費用） |
| 專案加班 | ✅ | ✅ |
| 薪資自動結算 | ✅ | ❌ |
| 勞健保扣繳 | ✅ | ❌ |
| 薪資單查看 | ✅ | ❌ |
| 年度 Total Comp | ✅ | ❌ |

### C. v0.1 範圍外（v0.2+）

明確排除於 v0.1 的功能，未來版本再評估：

- OCR 全文搜尋
- 績效考核系統
- 彈性工時班別管理

---

*myOPS PRD v0.4 | 2026-04-03 | 精拓生技 CancerFree Biotech — 機密*
*v0.4 變更：新增公告 / 規章 AI 自動翻譯功能（Gemini API）；documents 表新增三語內容欄位；新增 /api/translate；system_settings 新增 gemini_api_key；/admin/settings 新增 API Key 管理*
