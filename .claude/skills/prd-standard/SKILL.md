---
name: prd-standard
description: >
  坂本的專案開發標準，涵蓋 PRD 生成、開發規範、版本管理與 Code Review。
  必須在以下情境使用此 skill：
  1. 新專案開始時 — 使用者說「開新專案」「init」「寫 PRD」「新增功能規格」
  2. 開發過程中 — 使用者詢問技術選型、架構決策、資料表設計、API 設計
  3. Code Review 時 — 使用者說「review」「檢查」「PR」「符不符合規範」
  4. 版本管理 — 使用者說「push」「release」「version」「changelog」
  即使使用者沒有明確說「PRD」或「規範」，只要是新功能開發或架構討論，都應主動參考此 skill。
---

# PRD Standard Skill

坂本所有開發專案的統一規範。Claude Code 在生成 PRD、做技術決策、Review 程式碼時，
必須遵守此 skill 定義的標準。

---

## 使用此 Skill 的三個模式

### 模式 A：生成新專案 PRD
觸發：「開新專案」「寫 PRD」「init」

步驟：
1. 詢問專案名稱、核心功能（一句話）、目標用戶
2. 詢問技術棧差異（參考 `references/tech-stack.md` 的預設值，確認哪些需要更換）
3. 依照本 skill 的 PRD 結構生成 PRD.md
4. 同時生成 CHANGELOG.md 初始版本與 .env.example

### 模式 B：開發過程查閱規範
觸發：技術選型問題、架構討論、資料表設計

步驟：
1. 讀取 `references/tech-stack.md` 確認預設技術棧
2. 讀取相關規範章節回答問題
3. 如有偏離標準，主動告知並說明理由

### 模式 C：Code Review
觸發：「review」「PR」「檢查」「符不符合規範」

步驟：
1. 讀取 `references/code-review-checklist.md`
2. 逐項檢查，標注 PASS / FAIL / WARN
3. FAIL 項目必須說明原因與修正方式

---

## PRD 文件結構（生成時依此順序）

每份 PRD.md 必須包含以下章節，順序固定：

```
# PRD：{專案名稱} — {一句話說明}

> 此文件供 Claude Code 使用。...（固定警語）

## ⚠️ Claude Code 工作守則
## 現況說明（版本已實作）        ← 迭代專案才需要
## 一、專案概覽
## 二、技術棧規格
## 三、使用者與身份系統
## 四、資料庫結構
## 五、環境變數
## 六、功能規格
  ### 6.1 認證流程
  ### 6.2 主題系統（Dark / Light Mode）
  ### 6.3 多國語言（i18n）
  ### 6.4 Footer — 署名與部署時間
  ### 6.5 Tooltip / ? 說明提示系統
  ### 6.6 說明文件規範
  ### 6.7 行動裝置支援（Mobile-first RWD）
  ### 6.8 {專案特定功能}...
## 七、頁面與 UI 規格
## 八、API 規格
## 九、安全性與 RLS
## 十、主題 / 樣式系統
## 十一、非功能需求
## 十二、版本命名與管理規則
## 十三、開發任務清單（Task List）
## 附錄
```

> 各章節的詳細規格請參考 `references/tech-stack.md`

---

## 固定規範（所有專案強制執行）

### Claude Code 工作守則（固定文字，每份 PRD 必須包含）

```
1. 每個 Task 開始前，先列出你打算新增或修改的檔案清單，等待人類確認後才開始實作
2. Task 清單中未提及的現有檔案，不得主動修改
3. 每完成一個 Task，告知完成內容，等待確認後再繼續下一個
4. 如對需求有疑問，先提問，不要自行假設
```

### Mobile-first 強制規範

所有頁面必須符合：
- 最低支援：iOS Safari 16+、Android Chrome 110+
- 觸控目標 ≥ 44×44px
- input/select 字型 ≥ 16px（防 iOS 自動縮放）
- 禁止 hover-only 互動
- Sidebar 在手機收折為 Drawer

### Dark / Light Mode 強制規範

- 所有頁面強制支援，使用 next-themes
- input 文字色：`text-gray-900 dark:text-gray-100`
- placeholder：`placeholder-gray-400 dark:placeholder-gray-500`
- 背景：`bg-white dark:bg-gray-950`
- 禁止 `text-white` 作為可讀文字色

### i18n 強制規範

- 套件：next-intl
- 語言：zh-TW（預設）/ en / ja
- 語言檔：`src/messages/{locale}.json`
- 禁止在元件內 hardcode 任何語言字串
- Tooltip 文字放在 `tooltips.*` 命名空間

### Footer 固定格式

```
坂本  |  v{version}  |  Deployed: {YYYY-MM-DD HH:mm}
```

環境變數：
- `NEXT_PUBLIC_AUTHOR_NAME=坂本`
- `NEXT_PUBLIC_APP_VERSION`
- `NEXT_PUBLIC_DEPLOY_TIME`

### 版本命名規則（SemVer）

格式：`v{MAJOR}.{MINOR}.{PATCH}[-{pre-release}]`

| 變更類型 | 遞增位置 | 範例 |
|---------|---------|------|
| 破壞性變更 | MAJOR | v1.0.0 → v2.0.0 |
| 新增功能 | MINOR | v1.0.0 → v1.1.0 |
| Bug fix / 文件 | PATCH | v1.0.0 → v1.0.1 |

Pre-release：`alpha` → `beta` → `rc` → 正式版

### 每次 Push 強制三件事

1. `package.json` version 遞增
2. `CHANGELOG.md` 頂部新增當版紀錄
3. `PRD.md` 更新 version + updated 欄位

CHANGELOG 分類：`Added` / `Changed` / `Fixed` / `Removed` / `Security` / `Docs` / `Chore`

### 說明文件規範

- 對象分層：外部 User（公開）vs 內部 Admin（需登入）
- 三語：zh-TW 主語言 → en → ja（不強求同步）
- 技術實作由獨立 skill 處理，此處只定義內容規範
- 連結透過環境變數：`NEXT_PUBLIC_DOCS_USER_URL` / `NEXT_PUBLIC_DOCS_ADMIN_URL`
- Dashboard Header 依 `users.locale` 自動帶到對應語言版本

---

## 參考檔案

需要更多細節時，讀取對應的 reference 檔案：

| 檔案 | 使用時機 |
|------|---------|
| `references/tech-stack.md` | 技術選型、套件清單、服務整合細節 |
| `references/code-review-checklist.md` | Code Review 逐項檢查 |
| `references/naming-conventions.md` | 檔案命名、變數命名、DB 欄位命名、TypeScript 型別組織 |
| `references/ui-patterns.md` | Server/Client Component 決策、表單、toast、loading、layout |
