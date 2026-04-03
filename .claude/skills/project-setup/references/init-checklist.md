# 新專案初始化 Checklist

> 每個新專案開始時必須完成以下所有項目。

---

## 必要檔案清單

```
{project-name}/
├── .claude/
│   └── skills/
│       └── prd-standard/      ← 從 my-skills 拉取
│           ├── SKILL.md
│           └── references/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx     ← Sidebar + Header + Footer
│   │   │   ├── page.tsx       ← Dashboard 首頁
│   │   │   └── settings/
│   │   │       └── page.tsx   ← 主題 & 語言設定
│   │   ├── api/
│   │   │   └── auth/
│   │   │       └── callback/
│   │   │           └── route.ts
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   └── layout.tsx         ← ThemeProvider + IntlProvider + Toaster
│   ├── components/
│   │   └── ui/                ← shadcn/ui 生成的元件（不手動修改）
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── supabase-browser.ts
│   ├── messages/
│   │   ├── zh-TW.json
│   │   ├── en.json
│   │   └── ja.json
│   ├── types/
│   │   ├── index.ts           ← 全域共用型別
│   │   ├── api.ts             ← ApiResponse<T>
│   │   └── database.types.ts  ← Supabase CLI 自動生成
│   └── middleware.ts
├── docs/                      ← 由獨立文件 skill 處理
├── .env.example
├── .env.local                 ← gitignore，本機用
├── CHANGELOG.md
├── CLAUDE.md                  ← Claude Code 工作指引（必要）
├── PRD.md
└── package.json               ← version: "0.1.0-alpha.1"
```

---

## .env.example 初始內容

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 網站
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# 版本 / 署名
NEXT_PUBLIC_APP_VERSION=0.1.0
NEXT_PUBLIC_DEPLOY_TIME=
NEXT_PUBLIC_AUTHOR_NAME=坂本

# 說明文件
NEXT_PUBLIC_DOCS_USER_URL=
NEXT_PUBLIC_DOCS_ADMIN_URL=
```

---

## CHANGELOG.md 初始內容

```markdown
# Changelog

## [v0.1.0-alpha.1] - {今日日期}

### Added
- 初始專案架構：Next.js 14 + Supabase + Microsoft Auth
- Dark / Light mode（next-themes）
- 多國語言 zh-TW / en / ja（next-intl）
- Dashboard Sidebar + Footer 署名
```

---

## 完成確認

- [ ] Next.js 專案建立完成
- [ ] my-skills 安裝完成（.claude/skills/prd-standard/）
- [ ] 核心套件安裝完成（含 zod、react-hook-form、sonner）
- [ ] shadcn/ui 初始化完成，基本元件已安裝
- [ ] PRD.md 生成完成
- [ ] CLAUDE.md 生成完成
- [ ] src/types/ 目錄建立完成（index.ts, api.ts）
- [ ] .env.example 建立完成
- [ ] .env.local 設定完成（填入實際值）
- [ ] CHANGELOG.md 建立完成
- [ ] package.json version = 0.1.0-alpha.1
- [ ] 初始 commit 推送至 GitHub
- [ ] Vercel 部署設定完成（連接 GitHub repo）
- [ ] Supabase Migration SQL 執行完成（users 表）
