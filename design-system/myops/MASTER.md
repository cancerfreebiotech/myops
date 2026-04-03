# myOPS Design System — MASTER

> **使用規則：** 建任何頁面或元件時，先查 `design-system/myops/pages/[page-name].md`。
> 如果頁面檔案存在，其規則**覆蓋**此 Master。若不存在，嚴格遵守以下規則。

---

**Project:** myOPS — 營運管理系統（CancerFree Biotech 內部）
**Updated:** 2026-04-03
**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, lucide-react
**Target Users:** 30 人公司內部員工（員工、主管、HR、財務、Admin）
**Platforms:** Web RWD（手機優先）

---

## 1. 設計原則

| 原則 | 說明 |
|------|------|
| **Dashboard 導向** | 登入第一眼看到「我有什麼要處理的」，待辦事項一目了然 |
| **行動優先** | 打卡、請假申請、公告確認以手機完成為主，RWD 不能馬虎 |
| **簡單優先** | 流程不複雜化，每頁只有一個主要 CTA，次要操作視覺從屬 |
| **通知不擾民** | 每日彙整而非逐筆通知，UI 不得跳過多確認彈窗 |
| **信任感** | 內部工具，強調正確性、清晰度、一致性，而非花俏 |

---

## 2. 色彩系統

### 2.1 主色板（Light Mode）

| Token | Hex | Tailwind | 用途 |
|-------|-----|----------|------|
| `--color-primary` | `#2563EB` | `blue-600` | 主要按鈕、連結、active state |
| `--color-primary-hover` | `#1D4ED8` | `blue-700` | 主要按鈕 hover |
| `--color-primary-light` | `#EFF6FF` | `blue-50` | 背景 tint、selected row |
| `--color-secondary` | `#64748B` | `slate-500` | 次要文字、labels |
| `--color-background` | `#F8FAFC` | `slate-50` | 頁面背景 |
| `--color-surface` | `#FFFFFF` | `white` | Card、Modal 背景 |
| `--color-border` | `#E2E8F0` | `slate-200` | 分隔線、輸入框邊框 |
| `--color-text` | `#0F172A` | `slate-900` | 主要文字 |
| `--color-text-muted` | `#64748B` | `slate-500` | 說明文字、placeholder |
| `--color-destructive` | `#DC2626` | `red-600` | 刪除、危險操作 |

### 2.2 語意狀態色（全系統共用）

| 狀態 | Background | Text | Border | 用途 |
|------|-----------|------|--------|------|
| **pending** 待審核 | `#FEF9C3` | `#854D0E` | `#FDE047` | 請假/合約/加班待審 |
| **approved** 核准 | `#DCFCE7` | `#166534` | `#86EFAC` | 已核准、已確認 |
| **rejected** 退回 | `#FEE2E2` | `#991B1B` | `#FCA5A5` | 已退回 |
| **expired** 到期 | `#FEE2E2` | `#991B1B` | `#FCA5A5` | 合約到期 |
| **archived** 封存 | `#F1F5F9` | `#475569` | `#CBD5E1` | 封存文件 |
| **draft** 草稿 | `#F8FAFC` | `#475569` | `#CBD5E1` | 薪資草稿 |
| **info** 資訊 | `#EFF6FF` | `#1E40AF` | `#BFDBFE` | 一般通知 |
| **urgent** 緊急 | `#FFF7ED` | `#9A3412` | `#FDBA74` | 緊急公告 |

### 2.3 Dark Mode 對應

| Light Token | Dark Value | Dark Tailwind |
|-------------|-----------|---------------|
| `--color-background` | `#0F172A` | `slate-900` |
| `--color-surface` | `#1E293B` | `slate-800` |
| `--color-border` | `#334155` | `slate-700` |
| `--color-text` | `#F1F5F9` | `slate-100` |
| `--color-text-muted` | `#94A3B8` | `slate-400` |
| `--color-primary-light` | `#1E3A5F` | — |

> Dark mode 使用 Tailwind `dark:` prefix，不得使用 CSS invert。語意狀態色在 dark mode 降低飽和度（加 `dark:opacity-80`）。

---

## 3. 字型系統

**Heading:** `Lexend` — 標題、大數字、KPI  
**Body:** `Source Sans 3` — 內文、表單、說明

```css
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&family=Source+Sans+3:wght@300;400;500;600;700&display=swap');
```

### 字級規範

| Role | Size | Weight | Line-height | 用途 |
|------|------|--------|-------------|------|
| `display` | 32px / 2rem | 700 | 1.2 | 頁面標題（Dashboard 歡迎語） |
| `h1` | 24px / 1.5rem | 700 | 1.3 | 區塊主標題 |
| `h2` | 20px / 1.25rem | 600 | 1.4 | 卡片標題、Modal 標題 |
| `h3` | 16px / 1rem | 600 | 1.5 | Section header |
| `body` | 15px / 0.9375rem | 400 | 1.6 | 內文（min 14px，勿低於此）|
| `small` | 13px / 0.8125rem | 400 | 1.5 | 說明文字、時間戳 |
| `label` | 13px / 0.8125rem | 500 | 1.4 | 表單標籤、Badge |
| `mono` | 13px / 0.8125rem | 400 | 1.5 | 薪資數字、代碼 |

> 數字顯示（薪資、統計）使用 `tabular-nums`，避免對齊跳動。

---

## 4. 間距與版型

### Spacing Scale（8dp 系統）

```
4px  — 極小間距（icon gap、badge padding）
8px  — 小間距（inline spacing）
12px — 中小（button padding block）
16px — 標準（card padding, form gap）
24px — 寬鬆（section gap）
32px — 大（頁面 padding top）
48px — 超大（主要 section 分隔）
```

### 版型結構

**Desktop（≥1024px）：**
```
[Sidebar 240px fixed] | [Main Content 全寬 - 240px]
                         ├── Page Header (title + actions)
                         ├── Content Area (padding: 24px 32px)
                         └── Footer / Pagination
```

**Mobile（<768px）：**
```
[Top App Bar 56px fixed]
[Content Area (padding: 16px)]
[Bottom Navigation 56px fixed — 最多 5 項]
```

**Tablet（768px–1023px）：**
```
[Collapsible Sidebar 240px] | [Content Area]
或 Top App Bar + Drawer
```

### Max Content Width

| 頁面類型 | Max Width |
|----------|-----------|
| 一般列表頁 | `max-w-7xl` (1280px) |
| 表單頁 | `max-w-2xl` (672px) |
| Modal | `max-w-lg` (512px) / `max-w-xl` (576px) |
| Admin 後台 | `max-w-7xl` (1280px) |

---

## 5. 元件規範

### 5.1 按鈕

| Variant | Style | 用途 |
|---------|-------|------|
| **Primary** | `bg-blue-600 text-white rounded-lg px-4 py-2.5 font-medium hover:bg-blue-700` | 主要提交、核准 |
| **Secondary** | `border border-slate-300 text-slate-700 rounded-lg px-4 py-2.5 hover:bg-slate-50` | 取消、次要操作 |
| **Destructive** | `bg-red-600 text-white rounded-lg px-4 py-2.5 hover:bg-red-700` | 刪除、退回 |
| **Ghost** | `text-blue-600 hover:bg-blue-50 rounded-lg px-3 py-2` | Inline 操作 |

- 所有按鈕：`transition-colors duration-150`、`cursor-pointer`
- Loading 狀態：顯示 `lucide-react` spinner，按鈕 disabled
- 危險操作（刪除）**必須** confirm dialog，不得直接執行
- 每個頁面只有一個 Primary 按鈕

### 5.2 狀態 Badge

```tsx
// 用途：請假/合約/加班/薪資的狀態顯示
// 範例
const statusConfig = {
  pending:  { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
  approved: { bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-200' },
  rejected: { bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-200' },
  expired:  { bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-200' },
  archived: { bg: 'bg-slate-100', text: 'text-slate-600',  border: 'border-slate-200' },
  draft:    { bg: 'bg-slate-50',  text: 'text-slate-500',  border: 'border-slate-200' },
  urgent:   { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
}
// 尺寸：text-xs font-medium px-2.5 py-0.5 rounded-full border
```

### 5.3 表格（資料列表）

- Desktop：標準 `<table>` 帶 `overflow-x-auto` wrapper
- Mobile：轉為 Card-list 或至少支援水平捲動
- 每行必有 hover 效果：`hover:bg-slate-50`
- 支援 checkbox 多選 + bulk action bar（操作 3+ 筆時用）
- 分頁：PAGE_SIZE = 20，含跳頁輸入框，顯示「第 X 頁，共 Y 筆」
- 空狀態：必須有 empty state（說明 + 引導操作）
- 排序欄位顯示 `↑↓` 箭頭，active 排序欄高亮

### 5.4 表單

- 每個 input 必須有 visible `<label>`，不可 placeholder-only
- 必填欄位標記 `*`（顏色 `text-red-500`）
- 錯誤訊息放在欄位下方（紅字 + 紅框），說明問題 + 如何修正
- 驗證時機：blur 後驗證，不在 keystroke 時
- 複雜表單（6+ 欄位）使用 section 分組
- 提交按鈕：顯示 loading state → success/error
- 長表單啟用 auto-save draft（避免意外關閉遺失）

### 5.5 Modal / Dialog

- 背景遮罩：`bg-black/50 backdrop-blur-sm`
- 動畫：`scale(0.95) opacity-0` → `scale(1) opacity-100`，duration 200ms
- 寬度：一般 `max-w-lg`，表單類 `max-w-xl`
- 必須提供關閉按鈕（右上角 X）+ ESC 關閉
- 危險操作 confirm dialog：
  - 標題清楚說明動作（「確認退回此請假申請？」）
  - 紅色 destructive 按鈕
  - 取消按鈕在右側 destructive 前

### 5.6 Sidebar 導航

- 寬度：240px（desktop fixed）
- 項目：icon + label，active 狀態 `bg-blue-50 text-blue-700 font-medium`
- 群組分隔：DMS / HR / Admin 分組，加 section header
- Badge：待審核數字用紅點或數字 badge（最多顯示 99+）
- Mobile：Drawer 形式，從左側滑入，點擊遮罩關閉

### 5.7 Dashboard 待辦卡片

```
┌─────────────────────────────────────┐
│ [icon] 待處理標題              [數量] │
│ 簡短說明文字                          │
│                          [立即處理 →] │
└─────────────────────────────────────┘
```
- 有待辦項目：邊框 `border-blue-200 bg-blue-50`
- 無待辦：`border-slate-200 bg-white`（不顯示或淡化）
- 緊急項目（urgent 公告、合約到期）：`border-orange-200 bg-orange-50`

### 5.8 打卡按鈕（Mobile 重點）

- 尺寸：Mobile 上最少 64px × 64px，桌面不縮小
- 未打卡：`bg-blue-600`，文字「上班打卡」
- 已打上班卡：`bg-green-600`，文字「下班打卡」
- 已打下班卡：`bg-slate-300 cursor-not-allowed`，文字「今日已完成」
- 打卡後：顯示時間戳 + GPS 取得結果

---

## 6. 互動規範

### 動畫與過渡

| 場景 | Duration | Easing |
|------|----------|--------|
| 按鈕 hover/press | 150ms | ease-out |
| Modal 開啟/關閉 | 200ms | ease-out / ease-in |
| Sidebar expand | 250ms | ease-in-out |
| Toast 出現/消失 | 300ms | ease-out |
| Loading skeleton | pulse 1.5s | ease-in-out |
| Page transition | 150ms | ease-out |

- 所有動畫 `transform/opacity` only（不 animate width/height）
- 必須支援 `prefers-reduced-motion: reduce`
- Spring press：`active:scale-[0.97]`（卡片、按鈕點擊反饋）

### Toast 通知

- 位置：右下角（desktop）/ 頂部（mobile）
- Auto-dismiss：成功 3s，錯誤 5s（不自動消失，需手動關閉）
- 不得 steal focus
- 使用 `aria-live="polite"`

### 2FA 簽核流程 UX

- 需要 2FA 的操作（核准/退回/確認已讀）：
  1. 點擊操作按鈕
  2. Modal 彈出顯示操作摘要（確認內容）
  3. 輸入 TOTP 或使用寬限期 session（不需再輸入）
  4. 送出後 loading → success/error
- **寬限期 10 分鐘**：連續多筆審核只需驗證一次，需在 UI 顯示「簽核驗證中（剩餘 X 分鐘）」
- 寬限期過期後操作：自動要求重新驗證，不跳過

---

## 7. 響應式斷點

| 斷點 | px | 行為 |
|------|-----|------|
| `sm` | 375px | 最小手機（測試基準） |
| `md` | 768px | 平板 |
| `lg` | 1024px | 桌面 sidebar 出現 |
| `xl` | 1440px | 寬螢幕 |

- `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` 作為頁面 wrapper 標準
- 表格 mobile 必須 `overflow-x-auto` 或轉 card
- 表單欄位 mobile 全寬，desktop grid 兩欄
- 底部導覽 mobile 最多 5 項（主頁、文件、HR、通知、設定）

---

## 8. 無障礙（Accessibility）

- 所有 icon-only 按鈕必須有 `aria-label`
- 所有表單欄位必須有 `<label for>`
- 顏色不得是唯一傳遞資訊的方式（狀態 badge 加文字描述）
- Focus ring 不得移除（`focus-visible:ring-2 focus-visible:ring-blue-600`）
- Tab order 必須符合視覺順序
- 對比度：內文 4.5:1，大文字 3:1

---

## 9. 圖示規範

- **唯一圖示庫**：`lucide-react`（不混用其他圖示庫）
- **不使用 emoji 作為圖示**
- 尺寸統一：inline 16px、button 20px、nav 20px、card header 24px
- 色彩繼承文字色（`currentColor`），不 hardcode

---

## 10. myOPS 特定 UX 規則

| 規則 | 說明 |
|------|------|
| **禁止多餘確認彈窗** | 回饋表單送出後直接顯示成功狀態，不跳確認彈窗 |
| **軟刪除提示** | 刪除/停用操作顯示「此操作可恢復，資料不會永久刪除」 |
| **離職員工交接清單** | 停用帳號時，必須在 modal 顯示名下合約/專案/待審項目 |
| **空的 Dashboard** | 無待辦時顯示正向訊息（「今天沒有待處理事項 🎉」），不顯示空白 |
| **打卡 GPS 狀態** | GPS 取得中 → spinner；取得成功 → 綠點；取得失敗 → 黃點（仍可打卡，標記無 GPS）|
| **合約關聯提示** | 上傳合約時，若同公司有其他文件，橫幅提示「此公司有 X 份文件，是否關聯？」|
| **薪資數字格式** | 所有薪資金額顯示 `NT$ X,XXX`，使用 `tabular-nums`，小數點對齊 |
| **日期格式** | 一律 `YYYY-MM-DD`（三語共用），不使用地區格式混用 |
| **公告分類顏色** | hr=blue, admin=slate, regulation=purple, urgent=orange |

---

## 11. 頁面配色對照

| 模組 | Accent Color | 說明 |
|------|-------------|------|
| Dashboard | `blue-600` | 主色 |
| DMS 文件 | `blue-600` | 主色 |
| HR 打卡 | `green-600` | 打卡到位感 |
| HR 請假 | `violet-600` | 區分打卡 |
| HR 加班 | `orange-600` | 警示感 |
| HR 薪資 | `emerald-600` | 財務正向感 |
| Admin | `slate-700` | 沉穩管理感 |

---

## 12. Anti-Patterns（嚴禁）

- ❌ Emoji 作為圖示
- ❌ 純 placeholder 作為表單 label
- ❌ 操作後無任何 feedback（loading/success/error）
- ❌ 危險操作（刪除/退回）無 confirm dialog
- ❌ Mobile 表格超出 viewport 無捲動
- ❌ 硬 coded hex（使用 Tailwind 色彩 token 或 CSS variable）
- ❌ 低對比度（灰底灰字）
- ❌ 移除 focus ring
- ❌ 在 keystroke 時即時驗證（應在 blur 後）
- ❌ 動畫使用 `width` / `height` 過渡（改用 `transform`）

---

## 13. Pre-Delivery Checklist

每次交付 UI code 前確認：

**視覺**
- [ ] 圖示全部來自 lucide-react，無 emoji
- [ ] 所有 clickable 元素有 `cursor-pointer`
- [ ] 狀態色使用第 2.2 節的語意色，不自創
- [ ] 薪資數字用 `tabular-nums`

**互動**
- [ ] 按鈕 loading 狀態正確
- [ ] 危險操作有 confirm dialog
- [ ] 表單送出後有 success/error feedback
- [ ] Toast 使用 `aria-live="polite"`

**RWD**
- [ ] 375px 手機測試無 overflow
- [ ] 表格有 `overflow-x-auto`
- [ ] 打卡按鈕 mobile 最少 64×64px
- [ ] Bottom navigation 不超過 5 項

**無障礙**
- [ ] `aria-label` 在所有 icon-only 按鈕上
- [ ] `<label for>` 在所有 input 上
- [ ] Focus ring 可見
- [ ] 狀態資訊不只靠顏色傳達

**i18n**
- [ ] 所有文字走 `useTranslations()` key，無硬 coded 中文
- [ ] zh-TW / en / ja 三語 key 完整
