# Code Review Checklist

> Code Review 時逐項檢查。每項標注 PASS / FAIL / WARN。
> FAIL 必須修正後才能 merge；WARN 建議修正但不強制。

---

## 每次 Push 必查（版本管理）

| # | 檢查項目 | 標準 |
|---|---------|------|
| V1 | `package.json` version 是否遞增 | 依 SemVer：fix→patch, feat→minor, breaking→major |
| V2 | `CHANGELOG.md` 是否有當版紀錄 | 頂部新增，包含 Added/Changed/Fixed 至少一項 |
| V3 | `PRD.md` version + updated 是否更新 | 與 package.json version 一致 |
| V4 | 若有文件變更，docs 是否同步更新 | zh-TW 文件必須同步，en/ja 開 Issue 追蹤 |

---

## Mobile-first

| # | 檢查項目 | 標準 |
|---|---------|------|
| M1 | input/select 字型大小 | `text-base`（16px）以上，避免 iOS 自動縮放 |
| M2 | 觸控目標大小 | 按鈕、連結最小 44×44px（`min-h-[44px] min-w-[44px]`）|
| M3 | hover-only 互動 | 禁止，必須有 tap 等效行為 |
| M4 | Sidebar 行動版 | 手機收折為 Drawer，`< md` breakpoint |
| M5 | 表格在手機 | 改為 Card 堆疊或支援橫向捲動（加 `overflow-x-auto`）|

---

## Dark Mode

| # | 檢查項目 | 標準 |
|---|---------|------|
| D1 | input 文字色 | `text-gray-900 dark:text-gray-100` |
| D2 | placeholder 色 | `placeholder-gray-400 dark:placeholder-gray-500` |
| D3 | 頁面背景 | `bg-white dark:bg-gray-950` |
| D4 | 禁用純白文字 | 不得使用 `text-white` 作為可讀文字色 |
| D5 | 新元件是否有 dark variant | 所有新增元件必須測試 dark mode |

---

## i18n

| # | 檢查項目 | 標準 |
|---|---------|------|
| I1 | Hardcode 字串 | 所有 UI 文字必須透過 `t('key')` 取得，禁止 hardcode |
| I2 | 新 key 是否三語都有 | zh-TW / en / ja 三個語言檔同步新增 key |
| I3 | Tooltip 文字 | 放在 `tooltips.*` 命名空間 |
| I4 | 語言切換後是否正常 | 手動切換三語確認沒有顯示 key 字串（如 `settings.theme`）|

---

## 資料庫 / API

| # | 檢查項目 | 標準 |
|---|---------|------|
| DB1 | RLS 是否啟用 | 每張新表 `alter table x enable row level security` |
| DB2 | Service Role Key | 只在 server-side 使用，不得出現在 client 程式碼 |
| DB3 | API 權限驗證 | 每個 API route 確認有驗證 session |
| DB4 | 新表是否有 Migration SQL | PRD 的資料庫章節必須包含建表 SQL |

---

## 元件規範

| # | 檢查項目 | 標準 |
|---|---------|------|
| C1 | Tooltip 是否加在規定位置 | Prompt 變數欄、AI 模型選擇、角色欄位等必須有 Tooltip |
| C2 | 圖片是否用 Next.js Image | 禁止直接用 `<img>`，使用 `<Image>` |
| C3 | 圖片 aspect-ratio | 圖片容器需固定 aspect-ratio，避免 layout shift |

---

## 安全性

| # | 檢查項目 | 標準 |
|---|---------|------|
| S1 | 環境變數 | `SUPABASE_SERVICE_ROLE_KEY` 不得出現在任何 `NEXT_PUBLIC_` 變數 |
| S2 | 網域限制 | Microsoft Auth 限定 `@{domain}` 帳號，callback route 驗證 email |
| S3 | SQL injection | 使用 Supabase 的 parameterized query，禁止字串拼接 SQL |

---

## 文件 / 版本

| # | 檢查項目 | 標準 |
|---|---------|------|
| DOC1 | User 文件不含技術細節 | docs/user/ 禁止提及 DB 結構、程式碼、環境變數 |
| DOC2 | 文件 front matter 更新 | updated 日期、version 欄位同步更新 |

---

## Review 輸出格式

```
## Code Review — v{version} {日期}

### 版本管理
- [PASS] V1 package.json version 已遞增至 0.2.0
- [FAIL] V2 CHANGELOG.md 未更新 ← 必須修正

### Mobile-first
- [PASS] M1 input 字型 16px
- [WARN] M5 聯絡人列表在手機沒有 Card 排版，建議改善

### Dark Mode
- [PASS] D1-D5 全部通過

### i18n
- [FAIL] I1 發現 hardcode 中文字串在 src/app/contacts/page.tsx:42 ← 必須修正

### 結論
FAIL 項目（必須修正後 merge）：V2, I1
WARN 項目（建議修正）：M5
```
