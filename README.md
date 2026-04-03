# myOPS — 精拓生技營運管理系統

**myOPS** (Operations Management System) 是 [CancerFree Biotech 精拓生技](https://cancerfree.io) 的內部營運管理平台，整合文件管理 (DMS)、人資管理 (HR)、薪資結算等功能於單一系統。

> Production: [ops.cancerfree.io](https://ops.cancerfree.io)

---

## 系統架構

| 模組 | 說明 |
|------|------|
| **ORG** | 組織架構管理 — 部門、使用者、角色權限 |
| **DMS** | 文件管理系統 — 公告、合約、內部文件、AI 三語翻譯 |
| **HR** | 人資管理 — 打卡、請假、加班、薪資結算、勞健保 |

## 技術棧

| 項目 | 技術 |
|------|------|
| Framework | Next.js 16 (App Router + TypeScript) |
| UI | Tailwind CSS + shadcn/ui + lucide-react |
| Database | Supabase PostgreSQL + RLS |
| Auth | Supabase Auth + Microsoft AAD OAuth + MFA (TOTP) |
| Storage | Supabase Storage (Presigned URL) |
| i18n | next-intl (zh-TW / en / ja) |
| Deploy | Vercel + GitHub Actions (auto version bump) |
| Calendar | Microsoft Graph API (Outlook) |
| Bot | Microsoft Teams Bot (Dr.Ave) |
| AI | Google Gemini API (多語翻譯) |

## 專案結構

```
src/
  app/
    (dashboard)/            # 登入後頁面（受 proxy 保護）
      page.tsx              # Dashboard 首頁
      attendance/           # 打卡
      leave/                # 請假 + 團隊日曆
      overtime/             # 加班
      payroll/              # 薪資單 + 年度彙總
      projects/             # 專案管理
      documents/            # 文件管理
      announcements/        # 公告
      contracts/            # 合約
      settings/             # 個人設定
      feedback/             # 意見回饋
      admin/                # 管理後台
        users/              #   使用者管理 + 人事資料 + 離職交接
        departments/        #   部門管理
        companies/          #   公司主檔
        leave-types/        #   假別管理
        insurance-brackets/ #   勞健保級距表上傳
        bonuses/            #   獎金管理
        payroll/anomalies/  #   薪資異常檢查
        ...
    api/                    # API Routes (service role)
      auth/callback/        #   OAuth callback
      payroll/              #   薪資 CRUD + 自動計算 + 異常檢測
      calendar/             #   Outlook Calendar 整合
      teams/                #   Teams Bot 通知
      export/               #   xlsx 匯出（薪資/出勤/請假）
    login/                  # 登入頁
    mfa/                    # MFA 設定 / 驗證
  components/
    ui/                     # shadcn/ui 元件
    layout/                 # Sidebar, Footer, PageHeader, BottomNav
  lib/
    supabase/               # Server + Client Supabase clients
  messages/                 # i18n 語言檔 (zh-TW, en, ja)
  proxy.ts                  # Next.js 16 Proxy (auth + MFA 檢查)
```

## 主要功能

### 認證與安全
- Microsoft AAD OAuth 限 `@cancerfree.io` 網域
- 強制 MFA (TOTP) — 未設定導向 `/mfa/setup`
- 2FA 簽核 Session 寬限期 (10 分鐘)

### 文件管理 (DMS)
- 公告發布 + AI 三語自動翻譯 (Gemini)
- 公告確認需 MFA 驗證
- 合約上傳審核流程 (主管 → 入庫 → 通知營運長)
- Signed URL 檔案下載

### 人資管理 (HR)
- 打卡 (Web GPS) + 自動打卡補登
- 請假申請 → 簽核 → Outlook Calendar 同步
- 加班申請 (一般 / 專案) + 營運長超額通知
- 薪資自動結算 (底薪 + 加班費 - 勞健保 - 勞退自提)
- 薪資異常自動偵測 (加班 >46h、薪資差異 >20%)
- 勞健保級距表 Excel 上傳
- xlsx 匯出：薪資 / 出勤 / 請假

### 管理後台
- 使用者權限管理 (role + granted_features)
- 員工人事資料 (含敏感欄位遮罩)
- 離職交接清單 (名下合約 / 專案 / 待審項目)
- 獎金管理、稽核紀錄、系統設定

### 整合
- Teams Bot：每日彙整 / 即時通知 / 打卡提醒
- Outlook Calendar：請假自動建立 / 取消刪除事件

## 角色與權限

| 角色 | 說明 |
|------|------|
| `admin` | 最高權限，所有功能皆可存取 |
| `member` | 一般成員，透過 `granted_features` 擴充權限 |

主要 features: `publish_announcement`, `approve_contract`, `hr_manager`, `finance_payroll`, `coo_notify`, `manage_projects`

## 開發

```bash
npm install
npm run dev        # 開發伺服器
npm run build      # 建置
npx tsc --noEmit   # 型別檢查
```

### 環境變數

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://ops.cancerfree.io
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=
TEAMS_BOT_APP_ID=
TEAMS_BOT_APP_SECRET=
GEMINI_API_KEY=
```

## 部署

透過 GitHub Actions 自動部署至 Vercel：

1. Push 到 `master`
2. CI 自動 bump patch version (`0.1.1` → `0.1.2`)
3. `vercel build --prod` → `vercel deploy --prebuilt --prod`

## UI 設計規範

遵循 `design-system/myops/MASTER.md`：

- 模組配色：DMS=blue, 打卡=green, 請假=violet, 加班=orange, 薪資=emerald, Admin=slate
- 薪資數字：`NT$ X,XXX` + `tabular-nums`
- 日期格式：`YYYY-MM-DD`
- RWD 手機優先 (375px 起)
- 觸控目標 ≥ 44×44px

---

*myOPS — CancerFree Biotech 精拓生技*
