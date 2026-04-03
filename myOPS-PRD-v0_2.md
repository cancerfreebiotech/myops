# PRD：myOPS v0.1 — 營運管理系統
> 供 Claude Code 使用。請先閱讀完整 PRD，理解需求後提出技術架構與任務拆分計畫，確認後再開始實作。

---

## ⚠️ Claude Code 工作守則（請務必遵守）

1. **每個 Task 開始前**，先列出你打算新增或修改的檔案清單，等待人類確認後才開始實作
2. **Task 清單中未提及的現有檔案，不得主動修改**
3. **每完成一個 Task**，告知完成內容，等待確認後再繼續下一個
4. 如對需求有疑問，先提問，不要自行假設

---

## 一、專案背景與目標

### 1.1 背景

本系統由精拓生技（CancerFree Biotech）開發，為獨立於現有 **myCRM** 系統之外的新系統，但使用相同技術棧與相同使用者群（`@cancerfree.io` Microsoft AAD 帳號）。

系統名稱：**myOPS**（Operations Management System）

系統分三個模組，共用組織架構（公司 → 部門 → 員工）為基礎：

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

## 二、從 myCRM 學到的經驗（重要）

### 2.1 技術決策

以下是在 myCRM 開發過程中驗證有效的做法，本系統直接沿用：

**架構：**
- Next.js 14 App Router + TypeScript + Tailwind CSS
- Supabase（PostgreSQL + Storage + Auth）
- 部署：Vercel
- RWD：所有頁面 mobile friendly，使用 Tailwind responsive prefix

**API 規範：**
- 所有 API route 使用 **service role client**（繞過 RLS）
- 前端 Component 使用 **anon client**
- 錯誤處理：API 一律回傳 `{ error: string }` 格式
- 檔案上傳：**前端直傳 Supabase Storage（Presigned URL）**，不透過 Vercel API route（Vercel 有 4.5MB 上傳限制）

**版本規則：**
```
格式：MAJOR.MINOR.PATCH
新功能 → MINOR +1，PATCH 歸零
Bug fix → PATCH +1
MINOR 到 9 再新增功能 → MAJOR +1
每次 push 必須更新 package.json version 與 CHANGELOG.md
```

**i18n：**
- 使用 `next-intl`
- 語言檔放在 `src/messages/zh-TW.json`、`en.json`、`ja.json`
- 所有頁面文字必須三語完整，**不得有缺漏 key**
- 文件（`docs/`）也要有 `*.en.md` 和 `*.ja.md` 版本

### 2.2 權限系統（直接沿用 myCRM 設計）

```sql
-- users 表
role TEXT DEFAULT 'member'  -- 'member' | 'admin'
granted_features TEXT[] DEFAULT '{}'
```

- `admin` = 最高權限
- 一般使用者透過 `granted_features` 陣列授予特定功能
- 權限函式：

```typescript
export function hasFeature(role: string, grantedFeatures: string[], feature: FeatureKey): boolean {
  if (role === 'admin') return true
  return grantedFeatures.includes(feature)
}
```

### 2.3 MFA（直接沿用 myCRM v2.4 設計）

- 使用 Supabase 內建 TOTP MFA API（免費）
- 所有使用者登入後強制設定 MFA
- Middleware 檢查 AAL：無 factor → `/mfa/setup`；aal1 → `/mfa/verify`；aal2 → 正常進入
- 個人設定頁有 MFA 管理區塊

**2FA 簽核 Session 寬限期：**
- 簽核動作（審核、確認已讀等）需 2FA 驗證
- 設定 session 寬限期（預設 10 分鐘，Admin 可在 system_settings 調整）
- 寬限期內多筆簽核只需驗證一次，避免主管連續審核 10 筆要驗 10 次

### 2.4 軟刪除（直接沿用）

所有重要資料表使用軟刪除：
```sql
deleted_at TIMESTAMPTZ DEFAULT NULL
deleted_by UUID REFERENCES users(id)
```
查詢一律加 `WHERE deleted_at IS NULL`，有獨立回收區頁面。

### 2.5 檔案上傳最佳實踐

```
前端 → 向 API 要求 Presigned Upload URL
     → 直接從瀏覽器上傳到 Supabase Storage（繞過 Vercel 4.5MB 限制）
     → 上傳完成後通知 API 建立 DB 記錄
```

單檔上限：**50MB**

### 2.6 分頁與列表

- PAGE_SIZE = 20
- 分頁元件含跳頁輸入框
- 列表頁支援關鍵字搜尋 + 多維度篩選

### 2.7 注意事項與陷阱

1. **i18n namespace 必須對應**：頁面用 `useTranslations('xxx')`，語言檔就必須有 `xxx` namespace，否則顯示 raw key
2. **Supabase 查詢上限**：PostgREST 預設 max_rows=1000，大量資料需分批查詢或用 RPC
3. **Vercel 上傳限制**：API route 上傳上限 4.5MB，大檔案必須用 Presigned URL 直傳
4. **Storage 圖片 URL**：使用 signed URL 而非 public URL，避免快取問題
5. **Next.js 15 async params**：route params 需要 await，否則某些 API 會 404
6. **軟刪除查詢**：所有 query 記得加 `WHERE deleted_at IS NULL`
7. **MFA 未驗證 factor 清理**：enroll 後未完成驗證的 factor 5 分鐘後自動刪除，需處理這個 edge case
8. **Teams Bot 語言**：所有回覆訊息要支援三語，用語言包統一管理

---

## 三、技術棧規格

```
Framework:    Next.js 14 (App Router, TypeScript, Tailwind CSS)
Database:     Supabase PostgreSQL
Storage:      Supabase Storage
Auth:         Supabase Auth + Microsoft AAD OAuth
Deploy:       Vercel
i18n:         next-intl（zh-TW / en / ja）
UI:           Tailwind CSS + shadcn/ui（選用）
Icons:        lucide-react
Calendar:     Microsoft Graph API（Outlook Calendar 整合）
Bot:          Microsoft Teams Bot（沿用 myCRM Dr.Ave）
```

### 環境變數

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
MICROSOFT_GRAPH_CLIENT_ID=
MICROSOFT_GRAPH_CLIENT_SECRET=
TEAMS_BOT_APP_ID=
TEAMS_BOT_APP_SECRET=
```

---

## 四、組織架構模組（ORG）— 必須先建立

所有其他模組依賴組織架構，**必須優先實作**。

### 4.1 資料表

```sql
-- 部門
CREATE TABLE departments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  code         TEXT UNIQUE NOT NULL,  -- BD / LAB / HR / SAL / MKT / IT / OM
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- 初始部門資料
INSERT INTO departments (name, code) VALUES
  ('業務開發', 'BD'),
  ('實驗室', 'LAB'),
  ('人資', 'HR'),
  ('業務', 'SAL'),
  ('行銷', 'MKT'),
  ('資訊', 'IT'),
  ('營運', 'OM');

-- 使用者（繼承 Supabase Auth users）
CREATE TABLE users (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id),
  email               TEXT UNIQUE NOT NULL,
  display_name        TEXT,
  department_id       UUID REFERENCES departments(id),
  role                TEXT DEFAULT 'member',  -- 'member' | 'admin'
  granted_features    TEXT[] DEFAULT '{}',
  employment_type     TEXT DEFAULT 'full_time',  -- 'full_time' | 'intern'
  work_region         TEXT DEFAULT 'TW',         -- 'TW' | 'JP' | 'US' | 'OTHER'
  manager_id          UUID REFERENCES users(id), -- 直屬主管
  deputy_approver_id  UUID REFERENCES users(id), -- 代理審核人（CEO 指定，用於一級主管合約審核）
  job_title           TEXT,                       -- 職稱（純顯示用，邏輯走 granted_features）
  is_active           BOOLEAN DEFAULT TRUE,       -- FALSE = 離職
  language            TEXT DEFAULT 'zh-TW',
  theme               TEXT DEFAULT 'light',
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 員工人事資料（HR + Admin 可編輯，員工僅可查看自己的）
CREATE TABLE user_profiles (
  user_id             UUID PRIMARY KEY REFERENCES users(id),
  hire_date           DATE,                       -- 到職日
  termination_date    DATE,                       -- 離職日
  id_number           TEXT,                       -- 身分證字號（加密儲存）
  birth_date          DATE,
  phone               TEXT,
  address             TEXT,
  emergency_contact   TEXT,                       -- 緊急聯絡人姓名
  emergency_phone     TEXT,
  bank_code           TEXT,                       -- 銀行代碼
  bank_account        TEXT,                       -- 銀行帳號（加密儲存）
  labor_pension_self  NUMERIC(3,1) DEFAULT 0,     -- 勞退自提比例 0-6%（員工自己設定）
  monthly_salary      NUMERIC(12,2),              -- 月薪（full_time）
  hourly_rate         NUMERIC(8,2),               -- 時薪（intern，每人可不同）
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_by          UUID REFERENCES users(id)
);
```

### 4.2 組織架構 — 簽核鏈定義

**彙報關係透過 `manager_id` 定義：**

| 員工身分 | manager_id 指向 | 說明 |
|----------|----------------|------|
| 一般員工 | 直屬主管 | 請假、合約審核走這條線 |
| 一級主管（含營運長） | CEO 或 NULL | 請假固定送 HR；合約走 deputy_approver_id |
| CEO | NULL | 自己指定審核人 |

**簽核規則：**

| 場景 | 請假簽核人 | 合約簽核人 | 通知 |
|------|-----------|-----------|------|
| 一般員工 | 直屬主管（manager_id） | 直屬主管 → 通知營運長 | — |
| 一級主管 | HR（有 `hr_manager` 權限的人） | 代理審核人（deputy_approver_id，CEO 指定）→ 通知營運長 | — |
| CEO | CEO 自己指定的人 | CEO 自己指定的人 | CEO 被通知 |

**一人部門處理**：如果部門只有主管一人，該主管的請假 / 合約審核自動走一級主管規則（送 HR / 代理審核人），系統不得因此卡住流程。

### 4.3 granted_features 完整清單

| Key | 說明 | 適用場景 |
|-----|------|----------|
| `publish_announcement` | 可發布公告/規章 | DMS |
| `approve_contract` | 可審核合約（限本部門或代理審核） | DMS |
| `export_signatures` | 可匯出簽署清單（.xlsx） | DMS |
| `view_internal_dept` | 可查看特定部門內部文件 | DMS |
| `hr_manager` | HR 主管：審核一級主管請假、管理假別、管理薪資設定 | HR |
| `finance_payroll` | 財務：查看已核准加班紀錄、結算薪資、上傳勞健保級距表 | HR |
| `coo_notify` | 營運長：接收合約入庫通知、專案加班超額通知 | ORG |
| `manage_projects` | 可建立專案活動、指定專案負責人 | HR |

### 4.4 管理頁面

- `/admin/departments` — 部門管理（Admin 可新增/修改，代號不可重複）
- `/admin/users` — 使用者管理（設定部門、角色、granted_features、manager_id、deputy_approver_id、停用帳號）
- 停用帳號時自動列出該員工名下：合約、未結案專案、待審核項目，提醒交接

---

## 五、文件管理模組（DMS）

### 5.1 資料夾結構

管理員預建，員工不得新增資料夾：

| 資料夾 | 類型代號 | 說明 |
|--------|----------|------|
| 01_全公司共用 | ANN / REG | 公告、規章，全員可讀 |
| 02_外部合約 | NDA / MOU / CONTRACT / AMEND | 依公司名建子資料夾 |
| 03_內部文件 | INTERNAL | 依部門分子資料夾；免審核直接入庫 |
| 04_封存 | ARCHIVED | 手動封存；僅 Admin 可查閱 |

**內部文件（INTERNAL）免審核**：30 人公司不需要每份內部文件都跑審核流程，上傳即入庫。

### 5.2 資料表

```sql
-- 公司主檔（DMS 專用，用於外部合約分類）
CREATE TABLE companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  aliases    TEXT[] DEFAULT '{}',    -- 別名（避免同公司不同寫法）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 文件主表
CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  doc_type        TEXT NOT NULL,
    -- 'ANN' | 'REG' | 'NDA' | 'MOU' | 'CONTRACT' | 'AMEND' | 'INTERNAL'
  folder          TEXT NOT NULL,
    -- 'shared' | 'contracts' | 'internal' | 'archived'
  department_id   UUID REFERENCES departments(id),  -- 內部文件用
  company_id      UUID REFERENCES companies(id),    -- 外部合約用
  related_doc_id  UUID REFERENCES documents(id),    -- 關聯文件（如 AMEND 關聯原合約）
  file_url        TEXT,
  file_name       TEXT,
  file_size       INTEGER,
  expires_at      DATE,             -- 合約到期日
  owner_id        UUID REFERENCES users(id),    -- 合約負責人
  uploaded_by     UUID REFERENCES users(id),
  status          TEXT DEFAULT 'pending',
    -- 'pending' | 'approved' | 'rejected' | 'archived' | 'expired'
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  reject_reason   TEXT,
  -- 公告相關
  announcement_category TEXT,       -- 'hr' | 'admin' | 'regulation' | 'urgent'
  reminder_days   INTEGER,          -- 公告提醒間隔天數
  reminder_until  TEXT DEFAULT 'all_confirmed',  -- 'all_confirmed' | 'date'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES users(id)
);

-- 文件確認紀錄（公告/規章已讀）
CREATE TABLE document_confirmations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  mfa_verified BOOLEAN DEFAULT TRUE,  -- 必須通過 2FA
  UNIQUE(document_id, user_id)
);

-- 公告確認對象
CREATE TABLE document_recipients (
  document_id  UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id),
  PRIMARY KEY (document_id, user_id)
);

-- 稽核紀錄（不可刪除，保存 5 年）
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      UUID REFERENCES documents(id),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
    -- 'upload' | 'approve' | 'reject' | 'confirm' | 'archive' | 'restore' | 'download'
  detail      JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.3 審核流程

**合約類（NDA / MOU / CONTRACT / AMEND）：**
```
員工上傳（填到期日、負責人、關聯公司）
  → 上傳時系統提示：「同公司有 X 份文件，是否關聯？」
  → 主管審核（有 approve_contract 權限 + 同部門，或 deputy_approver_id）
    → 通過：入庫 + 通知上傳者 + 通知營運長（純告知）
    → 退回：通知上傳者 + 附退回原因
  → 審核動作需 2FA（受 session 寬限期保護）
```

**合約負責人簽核規則：**

| 上傳者身分 | 審核人 | 通知 |
|-----------|--------|------|
| 一般員工 | 直屬主管（需有 `approve_contract`） | 營運長（純告知） |
| 一級主管 | 代理審核人（`deputy_approver_id`） | 營運長（純告知） |
| CEO | CEO 指定的人 | — |

**內部文件（INTERNAL）：免審核，上傳即入庫。**

**公告/規章（ANN / REG）：**
```
有 publish_announcement 權限的使用者發布
  → 選擇公告分類（人事/行政/法規規章/緊急通知）
  → 選擇確認對象（預設全公司，可指定特定人員）
  → 設定提醒頻率（每 X 天）
  → 入庫，通知所有確認對象
  → 收件人需 2FA 確認已讀（受 session 寬限期保護）
  → Teams Bot 依設定頻率提醒未確認者，直到全員確認
  → 離職（is_active=false）自動排除提醒
```

### 5.4 公告分類

| 分類 key | 名稱 | 說明 |
|----------|------|------|
| `hr` | 人事公告 | 人員異動、招募 |
| `admin` | 行政公告 | 行政事務 |
| `regulation` | 法規/規章 | 公司規章、法規更新 |
| `urgent` | 緊急通知 | 緊急事項 |

### 5.5 合約負責人管理

合約列表頁提供「負責人狀態」篩選：
- 有負責人（active）
- 負責人帳號已停用（離職）→ 需重新指派
- 無負責人

方便 Admin 快速找到需要重新指派的合約。

### 5.6 合約到期提醒

| 時間點 | 通知對象 | 管道 |
|--------|----------|------|
| 到期前 90 天 | 合約負責人 | Teams Bot + 系統通知 |
| 到期前 30 天 | 合約負責人 | 再次通知 |
| 到期當日 | 負責人 + Admin | 狀態標記「expired」 |
| 到期後 | — | 不自動封存，由 Admin / 主管 / 負責人手動封存 |

提醒天數由 Admin 可自訂（system_settings）。

### 5.7 公告歸檔頁

所有已發布公告有獨立頁面（`/announcements`），任何登入使用者可查看：
- 顯示公告列表（依分類、日期篩選）
- 顯示自己的確認狀態與時間
- 尚未確認者可直接在此確認（需 2FA）

### 5.8 公告發布者報表

發公告的人可以看到：
- 總人數 / 已確認人數 / 未確認人數（一目了然）
- 明細：每個人的確認狀態 + 確認時間
- 一鍵透過 Teams Bot 催未確認者
- 僅發布者與 Admin 可查看

### 5.9 公司主檔管理

- `/admin/companies` — 公司主檔（Admin 可建立/修改/合併）
- 可從現有合約資料批次匯入公司名稱
- 支援別名（避免同公司不同寫法分開）

### 5.10 技術要求

- HTTPS 加密傳輸 + 檔案加密儲存（at rest）
- 閒置 30 分鐘自動登出
- 頁面載入 < 2 秒
- 單檔上限 50 MB
- RWD 支援手機完成確認
- 稽核紀錄不可刪除，保存 5 年
- 繁體中文介面為主，支援英文及日文

---

## 六、HR 模組 — 打卡系統

### 6.1 打卡方式

| 管道 | 說明 |
|------|------|
| 網頁打卡 | 打卡時透過瀏覽器 Geolocation API 取得 GPS 座標 |
| Teams Bot | Bot 發提醒 + 打卡按鈕，點擊後跳轉網頁完成打卡 |

**GPS 策略：記錄但不限制。** 每筆打卡紀錄都存 GPS 座標，Admin/HR 可在後台查看。v0.1 不做地理圍欄限制（避免 GPS 飄移、室內訊號差等問題），未來可開設定限制打卡範圍。

### 6.2 班別與自動打卡規則

| | Full-time | 實習生（Intern） |
|---|-----------|-----------------|
| 預設班別 | 09:00 - 18:00（可在 system_settings 調整） | 無固定班別 |
| 上班打卡 | 手動打，忘了系統自動補 09:00（標記「系統自動」） | 必須手動打，不打就沒紀錄 |
| 下班打卡 | 手動打，忘了系統自動補 18:00（標記「系統自動」） | 必須手動打 |
| 自動打卡時機 | 每日排程（例如 09:30 檢查未打上班卡、18:30 檢查未打下班卡） | 無 |

**異常紀錄 Dashboard（HR 可見）：**
- 連續 3 天以上都是系統自動打卡的 full-time 員工 → 標記提醒 HR 關注
- 實習生忘打卡次數統計 → 超過月 3 次通知 HR

### 6.3 資料表

```sql
-- 打卡紀錄
CREATE TABLE attendance_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  clock_date    DATE NOT NULL,
  clock_in      TIMESTAMPTZ,
  clock_out     TIMESTAMPTZ,
  clock_in_lat  NUMERIC(10,7),      -- GPS 緯度
  clock_in_lng  NUMERIC(10,7),      -- GPS 經度
  clock_out_lat NUMERIC(10,7),
  clock_out_lng NUMERIC(10,7),
  is_auto_in    BOOLEAN DEFAULT FALSE,  -- 系統自動打卡
  is_auto_out   BOOLEAN DEFAULT FALSE,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, clock_date)
);

-- 班別設定（預留彈性，v0.1 先用預設）
CREATE TABLE work_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,         -- '標準班' / '彈性班'
  start_time      TIME NOT NULL,         -- 09:00
  end_time        TIME NOT NULL,         -- 18:00
  is_default      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO work_schedules (name, start_time, end_time, is_default) VALUES
  ('標準班', '09:00', '18:00', TRUE);
```

### 6.4 補打卡

補打卡用於實際加班場景（因為 full-time 系統已自動打卡）：

```
員工提交補打卡申請（填寫日期、時間、原因）
  → 直屬主管審核（需 2FA）
  → 通過：更新打卡紀錄
  → 退回：通知員工
```

---

## 七、HR 模組 — 請假系統

### 7.1 假別管理

HR（有 `hr_manager` 權限）可完整管理假別，每個假別可設定：

| 欄位 | 說明 |
|------|------|
| 名稱 | 三語（zh-TW / en / ja） |
| 適用對象 | `full_time` / `intern` / `all` |
| 薪資比例 | `1.0`（全薪）/ `0.5`（半薪）/ `0`（無薪） |
| 提前申請天數 | `0` = 可事後申請 |
| 年度額度類型 | `fixed`（固定天數）/ `by_seniority`（依年資）/ `unlimited` / `monthly`（每月） |
| 年度額度天數 | 數值或年資對照表 |
| 是否需附件 | Boolean |
| 附件說明 | 例如「請附診斷證明」 |

### 7.2 預設假別

| 假別 | 適用 | 提前天數 | 薪資 | 額度 | 備註 |
|------|------|----------|------|------|------|
| 特休 | full_time | 7 天 | 全薪 | 依年資（HR 設定每人額度） | — |
| 事假 | all | 1 天 | 無薪 | 14 天/年 | 實習生唯一假別 |
| 病假 | full_time | 0（事後） | 半薪 | 30 天/年 | 可要求診斷證明 |
| 婚假 | full_time | 7 天 | 全薪 | 8 天（勞基法） | — |
| 喪假 | full_time | 0 | 全薪 | 依親等 3-8 天 | — |
| 產假 | full_time | 7 天 | 全薪 | 8 週 | — |
| 陪產假 | full_time | 7 天 | 全薪 | 7 天 | — |
| 公假 | full_time | 1 天 | 全薪 | 無上限 | — |
| 生理假 | full_time | 0 | 無薪 | 每月 1 天 | — |

**HR 可新增自訂假別**（例如：疫苗假、颱風假等）。

**實習生只能請事假（無薪）。**

### 7.3 請假最小單位

**半天**（上半天 / 下半天）

### 7.4 特休額度

- 由 HR 依年資為每位員工設定
- 系統自動計算到職年資（從 `user_profiles.hire_date`）供 HR 參考
- HR 手動設定最終額度（因為可能有特殊約定）

### 7.5 請假流程

```
員工提交請假申請
  → 填寫：假別、起迄日期、半天/全天、原因、職務代理人、附件（如需要）
  → 系統檢查：
    - 提前天數是否符合（病假除外）
    - 剩餘額度是否足夠
  → 簽核（需 2FA）：
    - 一般員工 → 直屬主管
    - 一級主管（含營運長）→ HR
    - CEO → CEO 指定的人
  → 通過：
    - 自動同步到 Outlook Calendar（Microsoft Graph API）
    - 扣除假別額度
    - 通知申請人
  → 退回：通知申請人 + 附原因
```

**職務代理人**：請假時必填。系統預設帶同部門同事清單，可手動選其他部門。

### 7.6 Outlook Calendar 整合

請假核准後自動在員工的 Outlook Calendar 建立事件：
- 標題格式：`[請假] {姓名} - {假別}`
- 設為「外出」狀態
- 同部門同事可在 Outlook 看到誰請假

技術：使用 Microsoft Graph API（因已用 AAD 登入，可取得 OAuth token）

### 7.7 團隊請假日曆

`/leave/calendar` — 團隊日曆視圖：
- 顯示同部門成員的請假狀態
- 主管可看到全部門，員工看到同部門
- Admin 可看全公司
- 方便避免同一天太多人請假

### 7.8 資料表

```sql
-- 假別定義（HR 管理）
CREATE TABLE leave_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_zh             TEXT NOT NULL,
  name_en             TEXT NOT NULL,
  name_ja             TEXT NOT NULL,
  applicable_to       TEXT DEFAULT 'all',  -- 'full_time' | 'intern' | 'all'
  salary_ratio        NUMERIC(3,2) DEFAULT 1.0,  -- 1.0=全薪, 0.5=半薪, 0=無薪
  advance_days        INTEGER DEFAULT 0,    -- 提前申請天數，0=可事後
  quota_type          TEXT DEFAULT 'fixed', -- 'fixed' | 'by_seniority' | 'unlimited' | 'monthly'
  default_quota_days  NUMERIC(5,1),         -- 預設年度天數
  requires_attachment BOOLEAN DEFAULT FALSE,
  attachment_note     TEXT,
  sort_order          INTEGER DEFAULT 0,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 員工假別額度（每年度、每人）
CREATE TABLE leave_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  leave_type_id UUID REFERENCES leave_types(id),
  year          INTEGER NOT NULL,         -- 年度
  total_days    NUMERIC(5,1) NOT NULL,    -- 總額度
  used_days     NUMERIC(5,1) DEFAULT 0,   -- 已使用
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_by    UUID REFERENCES users(id),
  UNIQUE(user_id, leave_type_id, year)
);

-- 請假申請
CREATE TABLE leave_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  leave_type_id   UUID REFERENCES leave_types(id),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  start_half      TEXT DEFAULT 'full',  -- 'full' | 'morning' | 'afternoon'
  end_half        TEXT DEFAULT 'full',
  total_days      NUMERIC(5,1) NOT NULL,
  reason          TEXT,
  deputy_user_id  UUID REFERENCES users(id),  -- 職務代理人
  attachment_url  TEXT,
  status          TEXT DEFAULT 'pending',
    -- 'pending' | 'approved' | 'rejected' | 'cancelled'
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  reject_reason   TEXT,
  outlook_event_id TEXT,             -- Outlook Calendar event ID（用於取消時刪除）
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 八、HR 模組 — 加班系統

### 8.1 一般加班（平日）

```
員工提前 8 小時提交加班申請
  → 填寫：日期、預計時段、原因
  → 直屬主管審核（需 2FA）
  → 通過後，員工於該時段打卡（手動打卡）
  → 打卡紀錄標記為加班
```

### 8.2 專案加班（週末/特殊專案）

**專案管理（有 `manage_projects` 權限的人可建立）：**

```sql
-- 專案
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  project_lead_id UUID REFERENCES users(id),  -- 專案負責人
  start_date      DATE,
  end_date        DATE,
  status          TEXT DEFAULT 'active',  -- 'active' | 'completed' | 'cancelled'
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- 專案成員
CREATE TABLE project_members (
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  PRIMARY KEY (project_id, user_id)
);
```

**專案加班流程：**
```
專案成員填寫加班時數（日期、時段、工作內容）
  → 專案負責人審核時數與合理性（需 2FA）
  → 營運長被通知（純告知，不需逐筆核准）
  → 若單筆加班超過門檻（Admin 可設定，例如 8 小時），營運長需額外核准
  → 財務（finance_payroll）查看已核准紀錄，結算加班費
```

### 8.3 加班費率（HR 可設定）

```sql
-- 加班費率設定
CREATE TABLE overtime_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_zh     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  name_ja     TEXT NOT NULL,
  rate        NUMERIC(4,2) NOT NULL,  -- 倍率，例如 1.34
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id)
);

-- 預設費率（台灣勞基法）
INSERT INTO overtime_rates (name_zh, name_en, name_ja, rate, description, sort_order) VALUES
  ('平日加班 前2小時', 'Weekday OT first 2hrs', '平日残業 最初2時間', 1.34, '月薪 ÷ 30 ÷ 8 × 1.34', 1),
  ('平日加班 後2小時', 'Weekday OT next 2hrs', '平日残業 次の2時間', 1.67, '月薪 ÷ 30 ÷ 8 × 1.67', 2),
  ('休息日 前2小時', 'Rest day OT first 2hrs', '休日残業 最初2時間', 1.34, '', 3),
  ('休息日 2-8小時', 'Rest day OT 2-8hrs', '休日残業 2-8時間', 1.67, '', 4),
  ('休息日 8小時以上', 'Rest day OT over 8hrs', '休日残業 8時間超', 2.67, '', 5),
  ('國定假日', 'National holiday', '祝日', 2.00, '加倍發給', 6);
```

### 8.4 加班資料表

```sql
-- 加班申請
CREATE TABLE overtime_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  request_type    TEXT NOT NULL,  -- 'regular' | 'project'
  project_id      UUID REFERENCES projects(id),  -- 專案加班時填
  ot_date         DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  hours           NUMERIC(4,1) NOT NULL,
  reason          TEXT,
  work_content    TEXT,           -- 專案加班時填工作內容
  overtime_rate_id UUID REFERENCES overtime_rates(id),
  status          TEXT DEFAULT 'pending',
    -- 'pending' | 'lead_approved' | 'coo_approved' | 'approved' | 'rejected'
    -- regular: pending → approved（主管核准即完成）
    -- project: pending → lead_approved（專案負責人）→ approved
    --          若超門檻：lead_approved → coo_approved → approved
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  coo_approved_by UUID REFERENCES users(id),
  coo_approved_at TIMESTAMPTZ,
  reject_reason   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 8.5 加班適用區域

| 功能 | TW | JP / US / OTHER |
|------|-----|-----------------|
| 加班申請 | ✅ | ✅（紀錄但不自動算費用） |
| 加班費率計算 | ✅（依設定費率） | ❌（不適用台灣勞基法） |
| 加班費結算 | ✅（財務結算） | ❌ |

---

## 九、HR 模組 — 薪資結算

### 9.1 適用範圍

**v0.1 僅台灣員工（`work_region = 'TW'`）自動結算。** JP / US / OTHER 不做薪資。

### 9.2 薪資結構

**Full-time（月薪制）：**
```
實發金額 = 月薪
         + 加班費
         - 無薪假扣款（月薪 ÷ 30 × 無薪假天數）
         - 勞保個人負擔
         - 健保個人負擔
         - 勞退自提（月薪 × 自提比例%）
```

**Intern（時薪制）：**
```
實發金額 = 時薪 × 當月總工時
         - 勞保個人負擔（依投保級距）
         - 健保個人負擔（依投保級距）
```

### 9.3 勞健保級距表

```sql
-- 勞保級距表（財務每年上傳更新）
CREATE TABLE labor_insurance_brackets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_year      INTEGER NOT NULL,
  grade               INTEGER NOT NULL,          -- 級數
  insured_salary      NUMERIC(10,0) NOT NULL,    -- 投保薪資
  employee_share      NUMERIC(10,0) NOT NULL,    -- 個人負擔
  employer_share      NUMERIC(10,0) NOT NULL,    -- 雇主負擔
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by         UUID REFERENCES users(id)
);

-- 健保級距表
CREATE TABLE health_insurance_brackets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_year      INTEGER NOT NULL,
  grade               INTEGER NOT NULL,
  insured_salary      NUMERIC(10,0) NOT NULL,
  employee_share      NUMERIC(10,0) NOT NULL,    -- 個人負擔（本人）
  employee_dependents NUMERIC(10,0),             -- 含眷屬加計
  employer_share      NUMERIC(10,0) NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by         UUID REFERENCES users(id)
);
```

**上傳流程**：財務（`finance_payroll`）每年上傳最新級距表（Excel），系統解析後寫入 DB。系統內建當前年度級距表作為預設值。

### 9.4 薪資結算流程

```
每月 1 號：系統自動產出薪資草稿
  → 自動計算：底薪、加班費、無薪假扣款、勞健保
  → 標記異常項目（加班時數異常高、請假超額等）
  → HR 檢查調整（hr_manager）
  → 財務確認（finance_payroll）
  → 營運長核准（coo_notify）
  → 每月 5 號（可在 system_settings 調整）發薪
  → 產出薪資明細，員工可查看自己的
```

### 9.5 薪資資料表

```sql
-- 月薪資紀錄
CREATE TABLE payroll_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id),
  year                INTEGER NOT NULL,
  month               INTEGER NOT NULL,
  -- 收入
  base_salary         NUMERIC(12,2),        -- 底薪（月薪 or 時薪×時數）
  overtime_pay        NUMERIC(12,2) DEFAULT 0,
  bonus               NUMERIC(12,2) DEFAULT 0,  -- 獎金（手動輸入）
  other_income        NUMERIC(12,2) DEFAULT 0,
  -- 扣款
  unpaid_leave_deduct NUMERIC(12,2) DEFAULT 0,
  labor_insurance     NUMERIC(12,2) DEFAULT 0,   -- 勞保個人負擔
  health_insurance    NUMERIC(12,2) DEFAULT 0,   -- 健保個人負擔
  labor_pension_self  NUMERIC(12,2) DEFAULT 0,   -- 勞退自提
  other_deduction     NUMERIC(12,2) DEFAULT 0,
  -- 合計
  gross_pay           NUMERIC(12,2),        -- 總收入
  total_deduction     NUMERIC(12,2),        -- 總扣款
  net_pay             NUMERIC(12,2),        -- 實發金額
  -- 雇主負擔（不顯示給員工，財務用）
  employer_labor_ins  NUMERIC(12,2) DEFAULT 0,
  employer_health_ins NUMERIC(12,2) DEFAULT 0,
  employer_pension    NUMERIC(12,2) DEFAULT 0,  -- 雇主提撥 6%
  -- 狀態
  status              TEXT DEFAULT 'draft',
    -- 'draft' | 'hr_reviewed' | 'finance_confirmed' | 'coo_approved' | 'paid'
  hr_reviewed_by      UUID REFERENCES users(id),
  hr_reviewed_at      TIMESTAMPTZ,
  finance_confirmed_by UUID REFERENCES users(id),
  finance_confirmed_at TIMESTAMPTZ,
  coo_approved_by     UUID REFERENCES users(id),
  coo_approved_at     TIMESTAMPTZ,
  anomaly_flags       JSONB,                -- 異常標記（{"high_overtime": true, "excess_leave": true}）
  note                TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year, month)
);

-- 年終獎金 / 額外獎金
CREATE TABLE bonus_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  year        INTEGER NOT NULL,
  month       INTEGER,              -- NULL = 年終獎金
  type        TEXT NOT NULL,        -- 'year_end' | 'performance' | 'project' | 'other'
  amount      NUMERIC(12,2) NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 9.6 薪資單（員工查看）

`/payroll` — 員工查看自己的薪資：
- 每月薪資明細（收入、扣款、實發）
- 年度 Total Compensation 彙總：年薪 + 加班費 + 各項獎金 - 總扣款
- 歷史紀錄

### 9.7 薪資異常自動標記

系統產出薪資草稿時自動檢查：
- 加班時數超過月 46 小時（勞基法上限）
- 無薪假天數異常
- 薪資與上月差異超過 20%
- 新進 / 離職員工（需按比例計算）

---

## 十、系統回饋模組（Feedback）

### 10.1 功能概述

提供全員回報「新增功能需求」與「Bug 回報」的統一入口。Admin 可在後台查看所有回饋，並可搭配 Claude Code 將內容（含截圖）送入 AI 進行理解與規劃。

**設計原則：**
- 表單簡單快速，不擾民
- 送出後不跳任何「確認提醒」彈窗，直接成功
- Bug 回報支援使用者自行截圖上傳（非系統自動截圖）

### 10.2 回饋類型

| 類型 | Key | 說明 |
|------|-----|------|
| 新增功能需求 | `feature_request` | 希望系統新增的功能 |
| Bug 回報 | `bug_report` | 發現的錯誤，可附截圖 |

### 10.3 表單欄位

**新增功能需求（feature_request）：**

| 欄位 | 必填 | 說明 |
|------|------|------|
| 類型 | ✅ | 固定為「新增功能需求」 |
| 標題 | ✅ | 簡短描述需求（max 100 字） |
| 說明 | ✅ | 詳細描述想要的功能與使用場景（max 2000 字） |

**Bug 回報（bug_report）：**

| 欄位 | 必填 | 說明 |
|------|------|------|
| 類型 | ✅ | 固定為「Bug 回報」 |
| 標題 | ✅ | 簡短描述問題（max 100 字） |
| 說明 | ✅ | 重現步驟與實際/預期行為（max 2000 字） |
| 截圖 | ❌ | 使用者自行截圖後上傳，支援 jpg / png，單檔上限 10MB，最多 3 張 |

**送出後：直接顯示成功狀態，不跳確認彈窗，不發通知給使用者。**

### 10.4 資料表

```sql
CREATE TABLE feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL,         -- 'feature_request' | 'bug_report'
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  screenshot_urls TEXT[] DEFAULT '{}', -- Supabase Storage 路徑，最多 3 張
  submitted_by  UUID REFERENCES users(id),
  status        TEXT DEFAULT 'open',   -- 'open' | 'in_progress' | 'done' | 'rejected'
  admin_note    TEXT,                  -- Admin 內部備註
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 10.5 Admin 後台（/admin/feedback）

Admin 可查看所有回饋，功能包含：

- 列表頁：依類型、狀態篩選；依建立時間排序
- 詳情頁：查看完整說明 + 截圖預覽
- 狀態管理：更新狀態（open → in_progress → done / rejected）
- Admin 備註：可寫內部處理紀錄（不顯示給提交者）

### 10.6 Claude Code AI 分析整合

Admin 或開發者可在 Claude Code 環境中，從資料庫撈取回饋並送入 AI 理解與規劃：

**使用場景：**
```
# 撈取待處理功能需求，讓 AI 理解並擬定開發計畫
SELECT id, title, description FROM feedback
WHERE type = 'feature_request' AND status = 'open'
ORDER BY created_at DESC;

# 撈取 Bug 回報（含截圖路徑），讓 AI 分析問題
SELECT id, title, description, screenshot_urls FROM feedback
WHERE type = 'bug_report' AND status = 'open'
ORDER BY created_at DESC;
```

**AI 分析流程（在 Claude Code 中操作）：**
```
1. 查詢 DB 取得回饋內容
2. 如有截圖 → 從 Supabase Storage 取得 signed URL
3. 將文字說明 + 截圖一併送入 Claude 分析
4. Claude 產出：問題摘要 / 影響範圍 / 建議修復方案 / 預估工時
```

截圖透過 Supabase Storage signed URL 傳入，Claude 可直接讀取圖片內容進行理解。

### 10.7 頁面入口

- 右下角浮動按鈕（全站可見，不影響主要操作）或 Sidebar 固定連結
- `/feedback/new` — 提交回饋（全員可用）
- `/admin/feedback` — 回饋管理（Admin 限定）

### 10.8 Storage bucket

截圖存於獨立 bucket：`feedback-screenshots`
- 路徑：`{feedback_id}/{filename}`
- 存取：需 signed URL（非 public）
- 保留期限：與回饋記錄同壽命（不另設自動刪除）

---

## 十一、Teams Bot 整合

沿用 myCRM Dr.Ave Teams Bot，新增 myOPS 相關功能：

### 11.1 每日彙整通知（重要）

**每天早上發一則彙整訊息，不逐筆通知：**

```
📋 你今天有 3 件待處理：
1. ⏰ 2 筆請假待審核
2. 📄 1 份合約待審核
👉 前往 myOPS 處理：[連結]
```

### 11.2 即時通知（僅重要事項）

| 情境 | Bot 行為 | 即時性 |
|------|----------|--------|
| 審核結果 | 「✅ 你的請假已核准」/「❌ 退回原因：...」 | 即時 |
| 緊急公告 | 分類為「urgent」的公告立即通知 | 即時 |
| 合約到期 | 到期前 90/30 天提醒 | 每日彙整 |
| 公告未確認 | 依設定頻率提醒 | 每日彙整 |
| 打卡提醒 | 上班前提醒打卡（附打卡按鈕連結） | 排程 |
| 薪資單 | 「💰 你的 X 月薪資單已產出」 | 即時 |

### 11.3 Bot 語言判斷

1. `users.language`
2. Teams `locale`
3. Fallback：中文

---

## 十二、系統設定（system_settings 表）

```sql
CREATE TABLE system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- 初始資料
INSERT INTO system_settings (key, value) VALUES
  -- 系統
  ('maintenance_mode', 'false'),
  ('mfa_approval_session_minutes', '10'),        -- 2FA 簽核寬限期
  -- DMS
  ('contract_reminder_days_first', '90'),
  ('contract_reminder_days_second', '30'),
  -- HR 打卡
  ('default_clock_in_time', '09:00'),
  ('default_clock_out_time', '18:00'),
  ('auto_clock_check_delay_minutes', '30'),       -- 自動打卡檢查延遲
  ('intern_missed_clock_alert_threshold', '3'),    -- 實習生月忘打卡次數門檻
  ('fulltime_auto_clock_alert_days', '3'),         -- Full-time 連續自動打卡提醒天數
  -- HR 加班
  ('overtime_min_advance_hours', '8'),             -- 加班最少提前申請時數
  ('project_ot_coo_threshold_hours', '8'),         -- 專案加班超過此時數需營運長核准
  -- HR 薪資
  ('payroll_pay_day', '5'),                        -- 每月發薪日
  ('payroll_auto_generate_day', '1'),              -- 每月自動產生薪資草稿日
  -- 通知
  ('daily_digest_time', '08:30');                  -- 每日彙整通知時間
```

---

## 十三、頁面結構

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
/feedback/new                  → 提交回饋（全員）
/admin/feedback                → 回饋管理（Admin 限定）
/admin/settings                → 系統設定（提醒天數、打卡時間、費率等）
/admin/leave-types             → 假別管理（HR）
/admin/overtime-rates          → 加班費率管理（HR）
/admin/insurance-brackets      → 勞健保級距表上傳（財務）
/admin/payroll                 → 薪資結算作業（HR → 財務 → 營運長）
/admin/payroll/anomalies       → 薪資異常檢查
/admin/attendance              → 全公司打卡紀錄（HR / Admin）
```

---

## 十四、功能適用區域對照

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

---

## 十五、開發任務清單（v0.1）

### Phase 1：基礎建設（必須先完成）

- [ ] **Task 1** `[新增]` — 初始化 Next.js 14 專案，設定 TypeScript、Tailwind、ESLint、next-intl
- [ ] **Task 2** `[新增]` — Supabase 專案設定：建立所有資料表（ORG + DMS + HR）、RLS 政策、Storage bucket
- [ ] **Task 3** `[新增]` — Microsoft AAD OAuth 登入（沿用 myCRM 相同設定）
- [ ] **Task 4** `[新增]` — MFA 強制設定（`/mfa/setup`、`/mfa/verify`、middleware AAL 檢查、簽核 session 寬限期）
- [ ] **Task 5** `[新增]` — Layout、Sidebar、主題切換（dark/light）、i18n 三語架構
- [ ] **Task 6** `[新增]` — 使用者管理頁（`/admin/users`）：部門指派、角色、granted_features、manager_id、deputy_approver_id、員工類型、工作區域
- [ ] **Task 7** `[新增]` — 員工人事資料管理（`user_profiles`）：到職日、銀行帳戶、勞退自提等
- [ ] **Task 8** `[新增]` — 部門管理頁（`/admin/departments`）
- [ ] **Task 9** `[新增]` — 公司主檔頁（`/admin/companies`）：新增、編輯、別名管理

### Phase 2：文件管理核心（DMS）

- [ ] **Task 10** `[新增]` — 文件上傳（Presigned URL 直傳）+ 建立 DB 記錄
- [ ] **Task 11** `[新增]` — 文件列表頁（搜尋、篩選、分類）
- [ ] **Task 12** `[新增]` — 合約上傳流程：填寫到期日、負責人、關聯公司；同公司文件提示關聯
- [ ] **Task 13** `[新增]` — 合約審核流程：主管審核（依簽核鏈）、通過/退回通知、通知營運長
- [ ] **Task 14** `[新增]` — 合約列表：負責人狀態篩選（有效 / 離職 / 無負責人）+ 到期篩選
- [ ] **Task 15** `[新增]` — 公告發布流程：選分類、選確認對象、設提醒頻率、入庫通知
- [ ] **Task 16** `[新增]` — 公告確認頁（2FA 驗證 + 確認已讀 + 記錄時間戳記）
- [ ] **Task 17** `[新增]` — 公告歸檔頁（全員可查看歷史公告 + 自己的確認狀態）
- [ ] **Task 18** `[新增]` — 公告發布者報表（確認進度、明細、一鍵催人）
- [ ] **Task 19** `[新增]` — 稽核紀錄（不可刪除，每個操作自動記錄）

### Phase 3：打卡系統

- [ ] **Task 20** `[新增]` — 打卡頁面（Web + GPS）+ 打卡 API
- [ ] **Task 21** `[新增]` — 自動打卡排程（Supabase Edge Function）：Full-time 忘打卡自動補
- [ ] **Task 22** `[新增]` — 打卡紀錄頁（個人 + 部門總覽）
- [ ] **Task 23** `[新增]` — 補打卡申請 + 主管審核
- [ ] **Task 24** `[新增]` — 打卡異常 Dashboard（HR 可見：連續自動打卡、實習生忘打卡）

### Phase 4：請假系統

- [ ] **Task 25** `[新增]` — 假別管理頁（`/admin/leave-types`）：HR 可 CRUD、設定規則
- [ ] **Task 26** `[新增]` — 員工假別額度管理（HR 依年資設定每人特休等額度）
- [ ] **Task 27** `[新增]` — 請假申請頁（選假別、日期、代理人、附件）+ 額度檢查 + 提前天數檢查
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
- [ ] **Task 39** `[新增]` — 薪資結算流程頁（`/admin/payroll`）：HR review → 財務確認 → 營運長核准
- [ ] **Task 40** `[新增]` — 薪資異常自動標記 + 異常檢查頁
- [ ] **Task 41** `[新增]` — 員工薪資單頁（`/payroll`）+ 年度 Total Compensation 彙總
- [ ] **Task 42** `[新增]` — 年終獎金 / 額外獎金管理（HR/財務手動輸入）

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
- [ ] **Task 51** `[新增]` — 系統設定頁（`/admin/settings`）：所有可調參數集中管理
- [ ] **Task 52** `[新增]` — 員工離職交接清單（列出名下合約、專案、待審項目）
- [ ] **Task 53** `[新增]` — 系統回饋表單（`/feedback/new`）：新增功能需求 / Bug 回報（含截圖上傳，送出不跳確認）
- [ ] **Task 54** `[新增]` — 回饋管理後台（`/admin/feedback`）：列表、狀態管理、截圖預覽、Admin 備註
- [ ] **Task 55** `[新增]` — i18n 補齊：所有頁面三語（zh-TW / en / ja）完整無缺漏
- [ ] **Task 56** `[新增]` — docs/ 文件：中英日三語版本

---

## 十六、v0.1 範圍外（v0.2+）

> 以下為明確排除於 v0.1 的功能，未來版本再評估：

- OCR 全文搜尋
- 績效考核系統
- 彈性工時班別管理

---

*myOPS PRD v0.2 | 2026-04-03 | 精拓生技 CancerFree Biotech — 機密*
*文件編號：ALL-CF-OPS-PRD-260403*
*v0.2 變更：新增系統回饋模組（十、Feedback）至 v0.1 範圍；移除範圍外清單中已納入的項目*
