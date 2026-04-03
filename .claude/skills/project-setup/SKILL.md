---
name: project-setup
description: >
  新專案初始化流程。當使用者說「開新專案」「init」「project setup」「建立新的 repo」，
  或是詢問專案初始架構時，使用此 skill。
  會引導使用者完成：repo 建立、skill 安裝、PRD 生成、環境變數設定、第一次 commit 的完整流程。
---

# Project Setup Skill

每次開新專案時的標準初始化流程，確保所有專案從第一天就符合規範。

---

## 初始化步驟

### Step 1：確認專案基本資訊

詢問使用者：
1. 專案名稱（用於 repo 名稱、package.json name）
2. 一句話說明（用於 PRD 標題、README）
3. 技術棧是否有差異（參考 prd-standard 的預設棧）
4. 目標網域（如 `@cancerfree.io`）

### Step 2：建立 Next.js 專案

```bash
npx create-next-app@latest {project-name} \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd {project-name}
```

### Step 3：安裝 my-skills

```bash
curl -fsSL https://raw.githubusercontent.com/cancerfreebiotech/my-skills/main/setup.sh | bash
```

選擇安裝 `prd-standard`（必裝）和其他需要的 skill。

### Step 4：安裝核心套件

```bash
npm install @supabase/ssr @supabase/supabase-js next-themes next-intl lucide-react \
  react-hook-form @hookform/resolvers zod sonner
```

### Step 4b：初始化 shadcn/ui

```bash
npx shadcn@latest init
# 選擇：Default style, CSS variables, yes for Tailwind

npx shadcn@latest add button input textarea select \
  dialog sheet skeleton badge table card \
  tooltip separator avatar form label
```

### Step 5：建立初始檔案結構

參考 `references/init-checklist.md` 建立所有必要的初始檔案。

### Step 6：PRD 處理

先詢問使用者：**「你已經有 PRD 了嗎？」**

#### 6A：已有 PRD（使用者說「有」或提供現有 PRD）

1. 請使用者貼上 PRD 內容，或告知 PRD 檔案路徑
2. 讀取後，對照 `prd-standard` 的 PRD 結構逐章節檢查：
   - 缺少的必要章節 → 列出，詢問是否要補齊
   - 有但格式不符規範 → 標注，詢問是否要調整
3. 確認後將 PRD 存為 `PRD.md`，補齊缺漏章節
4. **不重新生成**，只做補齊與格式對齊

#### 6B：尚無 PRD（使用者說「沒有」）

呼叫 `prd-standard` skill（模式 A），從零生成 `PRD.md`。

### Step 6b：生成 CLAUDE.md

在專案根目錄生成 `CLAUDE.md`，內容依據 Step 1 收集的資訊填入：

```markdown
# {project-name}

{one-line description}

## Tech Stack
- Next.js 14 (App Router + TypeScript)
- Tailwind CSS + shadcn/ui + next-themes
- Supabase (PostgreSQL + RLS + Auth)
- next-intl (zh-TW / en / ja)
- zod + react-hook-form
- sonner (toast)

## Key Paths
- Pages: src/app/
- Components: src/components/
- Lib: src/lib/
- Types: src/types/
- i18n messages: src/messages/

## Working Rules
1. 每個 Task 開始前，先列出打算新增或修改的檔案，等待確認後才開始
2. Task 清單中未提及的現有檔案，不得主動修改
3. 每完成一個 Task，告知完成內容，等待確認後再繼續
4. 如對需求有疑問，先提問，不要自行假設

## Conventions
- 所有 UI 文字透過 t('key')，禁止 hardcode
- Mobile-first，觸控目標 ≥ 44×44px
- 所有元件必須支援 dark mode
- 預設使用 Server Component，需要互動才加 'use client'
- 表單：zod schema + react-hook-form
- 通知：toast via sonner
- Loading：Skeleton 元件（配合 Suspense）
- 破壞性操作必須有確認 Dialog

## Skills
- .claude/skills/prd-standard/   — PRD、開發規範、Code Review
- .claude/skills/project-setup/  — 初始化流程
```

### Step 7：初始化版本管理

```bash
# 確認 package.json version 設為 0.1.0-alpha.1
# 建立 CHANGELOG.md
# 建立 .env.example
# 建立 .env.local（從 .env.example 複製）

git init
git add .
git commit -m "chore: initial project setup"
git branch -M main
git remote add origin https://github.com/cancerfreebiotech/{project-name}.git
git push -u origin main
```

---

## 參考檔案

- `references/init-checklist.md` — 初始化必要檔案清單
