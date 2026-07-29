# myOPS Design System — MASTER

> **使用規則：** 建任何頁面或元件前，先讀本檔。
> 若 `design-system/myops/pages/[page-name].md` 存在（目前**尚未建立任何頁面檔**），該頁面檔規則**覆蓋**此 Master；不存在時嚴格遵守以下規則。
> **真實來源是程式碼，不是本檔。** 本檔與程式碼衝突時以程式碼為準，並依 §14 回頭修正本檔。

---

**Project:** myOPS — 營運管理系統（CancerFree Biotech 內部）
**Updated:** 2026-07-29（依實際程式碼校正：技術棧、色彩雙軌、focus ring、字型、版型、Dialog、Toast、MFA）
**Target Users:** 30 人公司內部員工（員工、主管、HR、財務、Admin）
**Platforms:** Web RWD（手機優先）

**Tech Stack（以 `package.json` 為準）：**

| 類別 | 實際使用 |
|------|---------|
| Framework | Next.js **16.2.2** App Router、React **19.2.4**、TypeScript 5 |
| 樣式 | Tailwind CSS **v4**（`@tailwindcss/postcss`，**無 tailwind.config.js**，設定寫在 `src/app/globals.css` 的 `@theme inline`）、`tw-animate-css`、`shadcn` ^4.1.2（只吃它的 `shadcn/tailwind.css` preset） |
| 元件底層 | **`@base-ui/react` ^1.3.0 為主**（button / input / select / dialog / sheet / tooltip / badge / avatar / separator）。`@radix-ui` 只剩 `react-label` + `react-slot`，**僅** `src/components/ui/form.tsx` 在用 |
| 樣式變體 | `class-variance-authority` ^0.7.1 + `tailwind-merge` ^3.5（統一走 `cn()`，見 `src/lib/utils.ts`） |
| 圖示 | `lucide-react` **^1.7.0**（唯一圖示庫） |
| i18n | `next-intl` **^4.9.0**，三語 `zh-TW`（源語言）/ `en` / `ja`，見 `src/i18n/config.ts` |
| 主題 | `next-themes` ^0.4.6，`attribute="class"`、`defaultTheme="light"`、`enableSystem={false}` |
| Toast | `sonner` ^2.0.7 |
| 表單 | `react-hook-form` ^7.72 + `zod` **v4** + `@hookform/resolvers` |
| 其他 | `date-fns` v4、`xlsx`（匯出）、`@zxing/browser`（條碼掃描）、`jose` |

> ⚠️ 不是 Next 14、不是 shadcn/ui + Radix 全套。舊文件寫的 Radix 元件寫法（`asChild`、`<Dialog.Content>`）**不適用**；base-ui 用的是 `render` prop 與 `data-open` / `data-closed` 狀態屬性。

---

## 1. 設計原則

| 原則 | 說明 |
|------|------|
| **Dashboard 導向** | 登入第一眼看到「我有什麼要處理的」，待辦事項一目了然 |
| **行動優先** | 打卡、請假申請、公告確認以手機完成為主，RWD 不能馬虎 |
| **簡單優先** | 流程不複雜化，每頁只有一個主要 CTA，次要操作視覺從屬 |
| **通知不擾民** | 每日彙整而非逐筆通知，UI 不得跳過多確認彈窗 |
| **信任感** | 內部工具，強調正確性、清晰度、一致性，而非花俏 |
| **在地化第一** | 使用者可見文字一律走 `useTranslations()` / `getTranslations()`，三語同步（見 §10、§13） |

---

## 2. 色彩系統

⚠️ **myOPS 目前有兩套顏色寫法並存，動手前先確認你在哪一層。**

### 2.1 元件 token 層（`src/components/ui/*` 使用）

定義在 `src/app/globals.css`：`:root` / `.dark` 宣告 `--primary` 等原始變數，`@theme inline` 再把它們映射成 `--color-primary` 等 Tailwind token，於是可以寫 `bg-primary`、`text-muted-foreground`、`border-input`、`ring-ring`。

| Tailwind class | Light（oklch） | Dark（oklch） | 用途 |
|----------------|----------------|---------------|------|
| `background` / `foreground` | `1 0 0` / `0.145 0 0` | `0.145 0 0` / `0.985 0 0` | 頁面底色 / 主文字 |
| `card` / `card-foreground` | `1 0 0` / `0.145 0 0` | `0.205 0 0` / `0.985 0 0` | Card |
| `popover` / `popover-foreground` | `1 0 0` / `0.145 0 0` | `0.205 0 0` / `0.985 0 0` | Dialog、Select、Tooltip |
| **`primary`** / `primary-foreground` | **`0.205 0 0`（近黑）** / `0.985 0 0` | `0.922 0 0`（近白）/ `0.205 0 0` | 主要按鈕 |
| `secondary` / `secondary-foreground` | `0.97 0 0` / `0.205 0 0` | `0.269 0 0` / `0.985 0 0` | 次要按鈕 |
| `muted` / `muted-foreground` | `0.97 0 0` / `0.556 0 0` | `0.269 0 0` / `0.708 0 0` | 弱化底色 / 說明文字 |
| `accent` / `accent-foreground` | `0.97 0 0` / `0.205 0 0` | `0.269 0 0` / `0.985 0 0` | hover 底色 |
| `destructive` | `0.577 0.245 27.325` | `0.704 0.191 22.216` | 危險操作 |
| `border` / `input` | `0.922 0 0` / `0.922 0 0` | `1 0 0 / 10%` / `1 0 0 / 15%` | 邊框 / 輸入框邊框 |
| `ring` | `0.708 0 0` | `0.556 0 0` | focus ring（**中性灰，非藍**） |
| `sidebar*` | 見 globals.css | 見 globals.css | 目前共用元件未使用（保留） |

> 🚨 **`primary` 是中性近黑色，不是藍色。** 寫 `bg-primary` 期待藍色會踩雷。`<Button>` 預設樣式就是黑底白字（dark 模式反轉）。
>
> **圓角**：`--radius: 0.625rem`（10px）為基準，`@theme inline` 推導出 `radius-sm/md/lg/xl/2xl/3xl/4xl`。實務：按鈕/輸入框 `rounded-lg`、Card/Dialog `rounded-xl`、Badge `rounded-4xl`（膠囊）。

### 2.2 頁面調色層（頁面與 `src/components/layout/*` 使用）

頁面、`Sidebar.tsx`、`BottomNav.tsx`、`SidebarDrawer.tsx`、`PageHeader.tsx`、`StatusBadge.tsx` **直接用 Tailwind 內建色階**（slate 為骨架、blue 為強調），約 52 個檔案在用。這是既有慣例，**不要**為了統一而改成 token 層。

| 角色 | Light | Dark |
|------|-------|------|
| 頁面背景（dashboard shell） | `bg-slate-50` | `dark:bg-slate-900` |
| 卡片 / 導覽 / 面板 | `bg-white` | `dark:bg-slate-800` |
| 邊框、分隔線 | `border-slate-200` | `dark:border-slate-700` |
| 主要文字 | `text-slate-900` | `dark:text-slate-100` |
| 次要 / 說明文字 | `text-slate-500` | `dark:text-slate-400` |
| 弱標籤（section header、icon） | `text-slate-400` | `dark:text-slate-500` |
| hover 底色 | `hover:bg-slate-100` / `hover:bg-slate-50` | `dark:hover:bg-slate-700` |
| **強調色（連結、active、排序箭頭）** | `text-blue-600` | `dark:text-blue-400` |
| 強調底色（sidebar active、selected） | `bg-blue-50` | `dark:bg-blue-950` |
| focus ring（手刻元素） | `focus-visible:ring-2 focus-visible:ring-blue-600` | 同值 |

**判斷規則：**
- 用 `@/components/ui/*` 共用元件 → **不要**覆寫顏色，讓它吃 token 層。
- 手刻頁面元素（表格、卡片、導覽、tab、hero 區塊）→ 用 2.2 的 slate/blue 慣例，**每個顏色 class 都要配對應的 `dark:`**。

### 2.3 語意狀態色（單一真實來源：`src/components/StatusBadge.tsx`）

業務狀態（請假 / 合約 / 加班 / 薪資 / 採購 / 日報 / 回饋）**一律用 `<StatusBadge status={...} />`**，不要在頁面自刻色票。它同時負責 i18n（查 `common.*` key）。

| 狀態群 | Light | Dark |
|--------|-------|------|
| `pending` / `in_progress` | `bg-yellow-50 text-yellow-800 border-yellow-200` | `dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800` |
| `approved` / `done` / `paid` | `bg-green-50 text-green-800 border-green-200` | `dark:bg-green-900/20 dark:text-green-300 dark:border-green-800` |
| `rejected` / `expired` | `bg-red-50 text-red-800 border-red-200` | `dark:bg-red-900/20 dark:text-red-300 dark:border-red-800` |
| `archived` / `draft` / `cancelled` | `bg-slate-100`（archived/cancelled）/ `bg-slate-50`（draft）`text-slate-600 border-slate-200` | `dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700` |
| `open` / `hr_reviewed` / `finance_confirmed` / `lead_approved` | `bg-blue-50 text-blue-800 border-blue-200` | `dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800` |
| `coo_approved` | `bg-purple-50 text-purple-800 border-purple-200` | `dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800` |
| `urgent` | `bg-orange-50 text-orange-800 border-orange-200` | `dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800` |

尺寸固定：`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium`。

**新增狀態的流程**：同時更新 `STATUS_STYLE`（配色）與 `STATUS_KEY`（i18n key），並在 `common.*` 補三語，不要走捷徑在頁面 inline。

### 2.4 深淺色模式機制

- 機制：`globals.css` 的 `@custom-variant dark (&:is(.dark *))` + `next-themes` 在 `<html>` 掛 `.dark` class（`src/app/layout.tsx`）。
- `enableSystem={false}` → **不跟隨系統**，只吃使用者切換（Sidebar / BottomNav 的太陽/月亮鈕），預設 light。
- 因此**不要**寫 `@media (prefers-color-scheme: dark)`，一律用 `dark:` variant。
- 不得使用 CSS `invert` 或 filter 偽造深色。
- 交付前兩種模式都要看過；`bg-*` 有寫 `dark:` 而 `text-*` 忘了寫是最常見的低對比 bug。

---

## 3. 字型系統

**載入方式**：`src/app/globals.css` 第一行以 Google Fonts `@import` 載入（**不是 `next/font`**）：

```css
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&family=Source+Sans+3:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
```

**套用方式**（`globals.css` 的 `@layer base`）：

- `body` → `Source Sans 3`，`font-size: 15px`、`line-height: 1.6`（內文預設）
- `h1..h6` 與 `.font-heading` → `Lexend`（標題、KPI 數字）

**可靠的標題字型寫法（依序）：**
1. **語意標籤 `<h1>`–`<h6>`** — 最可靠，`@layer base` 的元素選擇器沒有 utility 與它競爭。
2. **`font-[Lexend]`** — arbitrary utility，值是字面字串，一定生效。`PageHeader.tsx` 等 15 個檔案在用。
3. ~~`font-heading`~~ — **目前實際上不生效，勿新用**（見下方缺口說明）。

- 數字（薪資、統計、工時）加 `tabular-nums`（`globals.css` 有定義該 class），避免對齊跳動。

> 🚨 **已確認缺口：`font-heading` utility 現在是失效的。**
> `@theme inline` 寫的是 `--font-sans: var(--font-sans)`、`--font-heading: var(--font-sans)`，但 `:root` / `.dark` **從未定義 `--font-sans` 實值** → 這是一個自我循環，CSS 視為 invalid at computed-value time。
> 檢查建置產物（`.next/static/chunks/*.css`）可看到**兩條同名規則**：
> ```css
> @layer base      { .font-heading { font-family: Lexend, system-ui, sans-serif } }  /* offset 17667 */
> @layer utilities { .font-heading { font-family: var(--font-sans) } }               /* offset 43991 */
> ```
> Tailwind v4 的 layer 順序是 `theme → base → components → utilities`，**utilities 勝出**，`var(--font-sans)` 循環失效後 `font-family` 退回繼承 → 實際渲染成 body 的 Source Sans 3。
> 影響：`CardTitle`、`DialogTitle` 目前**不是** Lexend（視覺上不明顯，但與設計意圖不符）。
> 修法：在 `:root` 補 `--font-sans: 'Source Sans 3', system-ui, sans-serif;`，並把 `--font-heading` 改成指向 Lexend 的實值。**修好之前不要**把現有的 `font-[Lexend]` 遷移成 `font-heading`。

### 字級規範（以 Tailwind class 表述，對齊實際用法）

| Role | Class | 用途 |
|------|-------|------|
| 頁面標題 | `text-xl font-semibold font-[Lexend]` | `PageHeader` 的 `<h1>` |
| 區塊標題 | `text-lg font-semibold` | 頁內 section |
| 卡片 / Dialog 標題 | `text-base font-medium`（現有程式碼帶 `font-heading`，但該 class 失效，實際渲染為內文字型） | `CardTitle`、`DialogTitle` |
| 內文 | 繼承 body（15px / 1.6）或 `text-sm` | 表格、表單、清單 |
| 說明 / 時間戳 | `text-sm text-muted-foreground`（元件層）或 `text-sm text-slate-500 dark:text-slate-400`（頁面層） | 輔助文字 |
| 標籤 / Badge | `text-xs font-medium` | Badge、section header |
| 金額 / 數字 | `tabular-nums` | 薪資、統計 |

> 內文最小 `text-sm`（14px），不得更小；`text-xs` 只用於 Badge / 標籤 / 註記。

---

## 4. 間距與版型

### Spacing Scale（Tailwind 預設 4px 基準）

```
gap-1 / p-1   (4px)  — icon gap、badge padding
gap-2 / p-2   (8px)  — inline spacing
gap-3 / p-3   (12px) — 緊湊卡片 (Card size="sm")
gap-4 / p-4   (16px) — 標準（Card padding、表單間距、mobile 頁面 padding）
gap-6 / p-6   (24px) — section 間距、desktop 頁面 padding
mb-6                 — PageHeader 與內容的固定間距
gap-8         (32px) — 大區塊分隔
```

### 版型結構（實際：`src/app/(dashboard)/layout.tsx`）

外層是 `flex h-screen bg-slate-50 dark:bg-slate-900`，**不是** 置中 + max-width 的 wrapper。

**Desktop（≥1024px / `lg`）**
```
[Sidebar aside w-56（收合 w-16）]  |  [main flex-1 overflow-y-auto p-4 lg:p-6]
                                       ├── <PageHeader title actions />   (mb-6)
                                       └── 內容（全寬，不再套 max-w）
```

**Tablet（768–1023px / `md`~`lg`）**
```
[SidebarDrawer 頂欄 header h-14（hidden md:flex lg:hidden）]
[main p-4]                              ← 側欄改為左側滑入 drawer（點遮罩關閉）
```

**Mobile（<768px）**
```
[main p-4 pb-20]                        ← 讓出底部導覽高度
[BottomNav fixed bottom-0 h-14（md:hidden）] ← 4 個主要項目 + 「更多」= 最多 5 格
```

### Max Content Width

| 情境 | 實際做法 |
|------|----------|
| 一般列表 / 詳情頁 | **不套 `max-w-*`**，吃 `main` 的 `p-4 lg:p-6` 全寬 |
| 表單頁 / 表單區塊 | `max-w-2xl`（最常見） |
| Dialog | base-ui 預設 `sm:max-w-sm`；表單型對話框自行覆寫 `sm:max-w-lg`（清單頁最常見的是 `max-w-lg`） |
| 登入 / 單欄卡片頁 | `max-w-sm` |

> 舊文件寫的 `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` **頁面 wrapper 標準已不成立**（全 repo 僅 3 處用 `max-w-7xl`）。不要在 dashboard 頁面新加這層 wrapper，會與側欄版型打架。

---

## 5. 元件規範

**原則：先找 `src/components/ui/*` 有沒有現成元件，有就用，不要自刻。** 共用元件一律 `data-slot="..."` 標記，方便從父層用 `has-data-[slot=...]` / `group-data-*` 做樣式聯動。

### 5.1 按鈕（`src/components/ui/button.tsx` + `button-variants.ts`）

底層 `@base-ui/react/button`。**變體與尺寸只有這些：**

| Variant | 實際樣式（重點） | 用途 |
|---------|------------------|------|
| `default` | `bg-primary text-primary-foreground`（**近黑底白字**，dark 反轉） | 主要提交、核准 |
| `outline` | `border-border bg-background hover:bg-muted`（dark 走 `border-input bg-input/30`） | 取消、次要操作 |
| `secondary` | `bg-secondary text-secondary-foreground` | 平行次要動作 |
| `ghost` | `hover:bg-muted` | inline 操作、icon 按鈕 |
| `destructive` | **`bg-destructive/10 text-destructive`（淡色調，不是實心紅）** + 紅色 focus ring | 刪除、退回 |
| `link` | `text-primary underline-offset-4 hover:underline` | 文字連結型 |

| Size | 高度 |
|------|------|
| `xs` / `sm` / `default` / `lg` | `h-6` / `h-7` / **`h-8`** / `h-9` |
| `icon-xs` / `icon-sm` / `icon` / `icon-lg` | `size-6` / `size-7` / `size-8` / `size-9` |

共通樣式（已內建，不用重寫）：`rounded-lg`、`text-sm font-medium`、`transition-all`、`outline-none`、`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`、`disabled:opacity-50 disabled:pointer-events-none`、`aria-invalid:*` 紅框、內部 `svg` 自動 `size-4`。

**觸控與回饋：**
- `pointer-coarse:min-h-11` 已內建（觸控裝置自動長到 44px），**不需要**再手加 `min-h-[44px]`；手刻的 `<button>` 才需要自己補。
- 按下回饋是 `active:not-aria-[haspopup]:translate-y-px`（下沉 1px）。頁面手刻的卡片/按鈕另有 `active:scale-[0.97]` 的舊慣例（7 處），兩者都可，但同一頁要一致。

**🚨 `buttonVariants` 必須從 `./button-variants` import，不能從 `button.tsx`：**
`button.tsx` 有 `'use client'`，Next.js 不允許 server component 呼叫 client 模組匯出的函式。純樣式函式因此抽到無 `'use client'` 的 `button-variants.ts`（feedback 清單頁曾因此 500，digest `767322977`）。Server component 要用 `buttonVariants({ variant, size })` 時：

```ts
import { buttonVariants } from '@/components/ui/button-variants'
```

**其他規則：**
- Loading：lucide 的 `Loader2` + `animate-spin`，同時 `disabled`。
- 危險操作（刪除 / 退回 / 撤銷）**必須** confirm dialog，不得直接執行。
- 每頁只有一個 `default` variant 的主要按鈕。
- 需要實心紅的破壞性主鈕時自行加 class，並在該頁保持一致。

### 5.2 Badge 與狀態

兩個不同東西，別搞混：

| 元件 | 用途 |
|------|------|
| `@/components/ui/badge.tsx` | **通用**標籤。base-ui `useRender`（支援 `render` prop 改 tag），變體 `default` / `secondary` / `destructive` / `outline` / `ghost` / `link`，固定 `h-5 rounded-4xl text-xs font-medium`。用於分類、計數、非狀態標記（例：公告分類用 `variant="outline"`）。 |
| `@/components/StatusBadge.tsx` | **語意狀態**。傳 `status` 字串，自動配色 + 自動 i18n。所有審核 / 流程狀態都走這個（見 §2.3）。 |

### 5.3 表格（資料列表）

- 基礎元件：`@/components/ui/table.tsx`；排序、搜尋、分頁優先重用 `@/components/procurement/table-tools.tsx`（目前 9 個採購清單頁在用；邏輯本身與採購無耦合，其他模組的新清單頁應直接重用而非自刻）：
  - `useTableSort(rows, defaultKey, defaultDir)` — null 永遠排最後、ISO 日期字串比較、字串走 `localeCompare(_, 'zh-Hant')`
  - `<SortableHeader />` — 含 `aria-sort`、`min-h-[44px]` 觸控目標、active 欄位箭頭 `text-blue-600`
  - `<TableSearch />` — 內建清除鈕（有 `aria-label`）
  - `usePagination(rows, pageSize = 20)` + `<TablePagination />`（`totalPages <= 1` 自動不顯示）
  - ⚠️ `TableSearch` / `TablePagination` 內部的文字（清除搜尋、頁碼資訊、上下頁 aria-label）讀 **`procurement.table.*`** i18n 命名空間。在非採購模組重用時，該命名空間仍需存在；若要正名，請把 key 搬到 `common.table.*` 並一次改完所有 9 個使用處。
- `PAGE_SIZE` 預設 **20**（`admin/audit` 例外為 50）。
- Desktop：`<table>` 外面包 `overflow-x-auto`；Mobile：轉 card-list 或至少可水平捲動。
- 每列 hover 效果：`hover:bg-slate-50 dark:hover:bg-slate-800`（部分頁面用 `/50` 透明度，兩者皆可，同頁一致）。
- 表頭：`text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400`；資料格 `px-4 py-3`。
- **空狀態必備**：`<td colSpan={n} className="text-center py-8 text-slate-400">` + i18n 說明（有引導動作更好）。
- 批次操作：3 筆以上才提供 checkbox 多選 + bulk action bar。

### 5.4 表單

- 組合：`react-hook-form` + `zod` v4 + `@hookform/resolvers`，欄位包在 `@/components/ui/form.tsx`（`FormField` / `FormItem` / `FormLabel` / `FormControl` / `FormMessage`，自動處理 `id`、`aria-describedby`、`aria-invalid`）。
  - 註：`form.tsx` 是全 repo **唯一**還依賴 `@radix-ui`（`react-label` + `react-slot`）的檔案，其餘元件都已是 base-ui。
- 每個 input 必須有可見 `<label>`（`ui/label.tsx`），不可只靠 placeholder。
- `Input` 內建 `text-base md:text-sm`（避免 iOS 聚焦時自動縮放），**不要覆寫成純 `text-sm`**。
- 必填標 `*`（`text-red-500`）；錯誤訊息放欄位下方（紅字 + `aria-invalid` 紅框），寫清楚「錯什麼 + 怎麼修」。
- 驗證時機：blur 後驗證，不在每次 keystroke。
- 6 個欄位以上分 section；長表單考慮 auto-save draft。
- 送出：按鈕 loading → 成功/失敗 toast。

### 5.5 Dialog / Sheet（`ui/dialog.tsx`、`ui/sheet.tsx`）

底層 `@base-ui/react/dialog`（ESC 關閉、點外關閉、focus trap 由 base-ui 提供，不用自己寫）。

- 遮罩：`bg-black/10 supports-backdrop-filter:backdrop-blur-xs`（**不是** `bg-black/50`）
- 內容：`rounded-xl bg-popover p-4 text-sm ring-1 ring-foreground/10`，寬度預設 `sm:max-w-sm`，表單型自行覆寫（常見 `sm:max-w-lg`）
- 動畫：`duration-100` + `data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95` / `data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95`（來自 `tw-animate-css`）
- 關閉鈕：`showCloseButton` 預設 `true`（右上角 X，含 `sr-only` 文字）
- `DialogFooter`：`border-t bg-muted/50`，`flex-col-reverse sm:flex-row sm:justify-end`（手機主鈕在上、桌機在右）
- 覆寫子元素 tag 用 base-ui 的 `render` prop（例：`<DialogPrimitive.Close render={<Button variant="outline" />}>`），**不是** Radix 的 `asChild`
- 危險操作 confirm dialog：標題寫清楚動作（例「確認退回此請假申請？」）、destructive 按鈕、取消鈕在其左側

### 5.6 Sidebar 導航（`components/layout/`）

- `Sidebar.tsx`：`aside` 寬 **`w-56`**（收合 `w-16`），僅 `lg` 以上顯示；收合狀態存在 component state。
- Active 樣式：`bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium`；非 active：`text-slate-600 dark:text-slate-400 hover:bg-slate-100`。
- `NavLink` 有 `min-h-[44px]`，icon 固定 `size={20}` + `aria-hidden="true"`。
- 分組：`SectionHeader`（`text-xs uppercase tracking-wider text-slate-400`）；**收合狀態時 section header 自動變成一條分隔線**。
- 顯示與否由 feature flag 決定：`isAdmin || features[key]`（`FeatureFlags`，見 `src/lib/feature-flag-keys.ts`），新增選單項要同時掛 flag。
- 底部固定區：主題切換、語言切換（`LANGUAGES`）、登出、版本號（`NEXT_PUBLIC_APP_VERSION` + 部署時間）。
- `variant="drawer"`：給 `SidebarDrawer`（tablet 滑入層）用，永不收合、顯示關閉鈕。
- `BottomNav.tsx`：`md:hidden fixed bottom-0 h-14`，4 個主要項目 + 「更多」展開層，**總格數不超過 5**；`MORE_ITEMS` 排序需與 Sidebar 一致。
- 新增導覽項目請**三處同步**：`Sidebar` / `SidebarDrawer`（共用 Sidebar）/ `BottomNav`。

### 5.7 Dashboard 待辦卡片

```
┌─────────────────────────────────────┐
│ [icon] 待處理標題              [數量] │
│ 簡短說明文字                          │
│                          [立即處理 →] │
└─────────────────────────────────────┘
```
- 有待辦：`border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40`
- 無待辦：`border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800`（淡化或不顯示）
- 緊急（urgent 公告、合約到期）：`border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/40` 或 orange 系
- 整張卡可點時：`rounded-xl min-h-[44px] cursor-pointer transition-colors duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-blue-600`

### 5.8 打卡按鈕（Mobile 重點）

實際做法（`app/(dashboard)/attendance/AttendanceClient.tsx`）：

- 上班/下班**兩顆按鈕並排常駐**（`grid grid-cols-2 gap-3`），用 `disabled` 表達可否打卡，而**不是**一顆按鈕換文字。
- 尺寸：`<Button size="lg" className="min-h-[56px] text-base">`，桌機不縮小；圖示 `size={18}`。
- 上班鈕用 `default` variant；下班鈕用 `variant="outline"` + blue 系覆寫（`border-blue-200 text-blue-700 dark:border-blue-700 dark:text-blue-400`）。
- 打卡後顯示時間戳 + GPS 取得結果。
- GPS 狀態：取得中 spinner、成功顯示綠色 `MapPin` + 座標、失敗黃色提示（**仍可打卡**，標記為無 GPS）。
- 補卡入口是低調的 ghost 文字鈕，不與主打卡動作競爭。

### 5.9 PageHeader（本次新增章節）

所有 dashboard 頁面（**64 個檔案**）統一用 `@/components/layout/PageHeader`：

```tsx
<PageHeader title={t('title')} description={t('description')} actions={<Button…/>} badge={t('beta')} />
```

- `title` → `<h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 font-[Lexend]">`
- `badge` 為**選填**，必須傳**已翻譯的字串**（不要傳寫死中文）；不傳就不渲染。樣式為黃框黃字小標，語意是「beta / 測試中」。目前**沒有任何頁面在傳這個 prop**。
- 固定 `mb-6`，`actions` 靠右。
- 改這個元件影響全站 64 個頁面檔，改動請整站掃過。

---

## 6. 互動規範

### 動畫與過渡

| 場景 | 實際值 |
|------|--------|
| 按鈕 / 連結 hover | `transition-colors duration-150`（Button 內建 `transition-all`） |
| Dialog 開關 | `duration-100` + `fade` / `zoom-95`（tw-animate-css） |
| Sidebar 收合 | `transition-all duration-200`（`w-56` ↔ `w-16`） |
| Toast | sonner 預設 |
| Loading skeleton | `@/components/ui/skeleton.tsx`（`animate-pulse`） |
| 按下回饋 | 共用 Button：`active:translate-y-px`；手刻卡片/按鈕：`active:scale-[0.97]` |

- 動畫優先 `transform` / `opacity`，**不要** animate `width` / `height`。
- 必須支援 `prefers-reduced-motion: reduce`。

### Toast 通知

- 全域只有一個 `<Toaster richColors position="top-right" />`（`src/app/layout.tsx`），**桌機手機同一個位置**，不要在頁面另外掛 Toaster。
- 用 `import { toast } from 'sonner'` → `toast.success()` / `toast.error()`；訊息文字走 i18n。
- 不自刻 toast、不用 `alert()`。
- sonner 已處理 `aria-live` 與不搶 focus。

### MFA（AAL2）簽核流程

myOPS 的簽核用 **Supabase MFA / AAL2（綁 session）**，**沒有** 自訂的「10 分鐘寬限期」，也**沒有**「剩餘 X 分鐘」UI。

1. `src/proxy.ts`（Next.js 16 把 `middleware.ts` 改名為 `proxy.ts`）檢查 `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`：
   - 已註冊 MFA 但本 session 未驗證 → 頁面 `redirect('/mfa/verify')`、API 回 401
   - 尚未註冊 → 導向 `/mfa/setup`
2. 每個審核類 API route **自己再檢查一次** `aalData?.currentLevel !== 'aal2'`，不符就回 `{ code: 'MFA_REQUIRED' }`。
3. 前端收到 `MFA_REQUIRED` → `toast.error(t('mfaRequired'))` 並 `router.push('/mfa/verify')`。
4. 驗證過的 session 內連續多筆審核不需重新輸入（AAL2 隨 session 有效）。
5. Teams 機器人一鍵直簽因無法跑 MFA，預設走 deep-link 回網站（見 `src/lib/bot-approval-policy.ts`）。

新增審核類 API 時，**必須**照抄既有 route 的 AAL2 檢查，不要只靠 proxy。

---

## 7. 響應式斷點

專案**未自訂**斷點，用 Tailwind v4 預設：

| 斷點 | px | myOPS 的實際意義 |
|------|-----|------------------|
| `sm` | 640px | 少用；主要在 Dialog 寬度（`sm:max-w-*`）與 footer 方向切換 |
| `md` | 768px | **BottomNav ↔ 頂欄 drawer 的分界**（`md:hidden` / `hidden md:flex`） |
| `lg` | 1024px | **Drawer ↔ 固定 Sidebar 的分界**，頁面 padding 升為 `lg:p-6` |
| `xl` | 1280px | 寬螢幕微調（少用） |

- **375px 是測試視窗，不是斷點**：交付前一定要在 375px 寬檢查無水平溢出。
- 表格 mobile 必須 `overflow-x-auto` 或轉 card。
- 表單與統計卡格線慣例：`grid grid-cols-1 sm:grid-cols-2`（最常見；三欄用 `sm:grid-cols-3` 或 `lg:grid-cols-3`）。mobile 一律單欄全寬。
- 底部導覽不超過 5 格（4 主要 + 更多）。

---

## 8. 無障礙（Accessibility）

- 所有 icon-only 按鈕必須有 `aria-label`（走 i18n）；裝飾性 icon 加 `aria-hidden`。
- 所有表單欄位必須有關聯 `<label>`；用 `ui/form.tsx` 會自動綁定。
- 顏色不得是唯一傳達資訊的方式（狀態一律附文字，`StatusBadge` 已內建）。
- **Focus ring 不得移除。兩套寫法，看你在哪一層：**
  - `src/components/ui/*` 共用元件：`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`（`badge.tsx` 用 `ring-[3px]`，等效）→ 中性灰 ring，已內建，不用重寫。
  - 手刻的 `<button>` / `<a>` / 可點卡片：`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600`（`table-tools.tsx` 的既有慣例）。
  - 寫了 `outline-none` 卻沒補 ring = 直接違規。
- 觸控目標：共用 Button 有 `pointer-coarse:min-h-11`；手刻元素自己補 `min-h-[44px]`（必要時 `min-w-[44px]`）。
- 可排序表頭要有 `aria-sort`；表頭 `<th scope="col">`。
- Tab order 符合視覺順序；Dialog 的 focus trap 交給 base-ui。
- 對比度：內文 4.5:1、大文字 3:1，**深淺兩色模式都要達標**。

---

## 9. 圖示規範

- **唯一圖示庫**：`lucide-react` ^1.7.0（不混用其他圖示庫）。
- **不使用 emoji 作為圖示。**
- 尺寸：用 `size={16}`（inline / 表格）、`size={20}`（導覽、按鈕）、`size={24}`（卡片標題）prop，或 Tailwind `size-4` / `size-5` class。放在 `<Button>` 裡的 svg 已自動 `size-4`（`size="xs"` 為 `size-3`、`sm` 為 `size-3.5`），不用另外指定。
- 色彩繼承文字色（`currentColor`），不 hardcode。
- 命名：v1 的 icon 有 `XIcon` / `ChevronDownIcon` 這種後綴寫法，也有 `Clock` / `FileText` 無後綴寫法，兩者都可用，同檔內保持一致即可。

---

## 10. myOPS 特定 UX 規則

| 規則 | 說明 |
|------|------|
| **i18n 三語同步** | 使用者可見文字一律 `useTranslations()`（client）/ `getTranslations()`（server），key 要同時補進 `src/messages/zh-TW.json`、`en.json`、`ja.json`。**嚴禁硬編中文**（含 `aria-label`、`placeholder`、toast 訊息、空狀態文字）。zh-TW 為源語言。 |
| **禁止多餘確認彈窗** | 回饋表單送出後直接顯示成功狀態，不跳確認彈窗 |
| **軟刪除提示** | 刪除/停用操作顯示「此操作可恢復，資料不會永久刪除」 |
| **離職員工交接清單** | 停用帳號時，必須在 modal 顯示名下合約/專案/待審項目 |
| **空的 Dashboard** | 無待辦時顯示正向訊息（走 i18n key），不顯示空白 |
| **打卡 GPS 狀態** | 取得中 → spinner；成功 → 綠點；失敗 → 黃點（仍可打卡，標記無 GPS） |
| **合約關聯提示** | 上傳合約時，若同公司有其他文件，橫幅提示「此公司有 X 份文件，是否關聯？」 |
| **薪資數字格式** | 金額顯示 `NT$ X,XXX`，配 `tabular-nums` |
| **日期格式** | 一律 `YYYY-MM-DD`（三語共用），不混用地區格式 |
| **公告分類** | 現況：`hr` / `admin` / `regulation` / `urgent` 一律用 `<Badge variant="outline">` 呈現（**已不分色**）；標籤文字走 `announcements.categories.*` i18n。若日後要恢復分類色，需同時更新本節。 |

---

## 11. 頁面配色傾向（參考，非強制）

模組主色只影響 hero / 圖表 / 該模組專屬強調元素；**狀態一律用 §2.3 語意色，不受模組色影響**。

| 模組 | Accent | 驗證 |
|------|--------|------|
| Dashboard / DMS 文件 / 通用強調 | `blue-600` | 廣泛使用 |
| 打卡 / 完成類動作 | `green-600` | 廣泛使用 |
| 請假、公告 | `violet-600` | leave/calendar、announcements |
| 加班、合約、專案、實驗室 | `orange-600` | projects、contracts、lab |
| 薪資、獎金、財務 | `emerald-600` | payroll、bonuses |
| Admin 後台 | `slate-700` | admin |

---

## 12. Anti-Patterns（嚴禁）

- ❌ 硬編中文（或任何語言）在 UI，未走 i18n key
- ❌ 只補 `zh-TW.json`，漏了 `en.json` / `ja.json`
- ❌ 只寫 light 的顏色 class，忘了配 `dark:`
- ❌ 業務狀態自刻 badge 色票（應用 `StatusBadge`）
- ❌ 從 `@/components/ui/button` import `buttonVariants` 到 server component（要從 `button-variants`，見 §5.1）
- ❌ 寫 `bg-primary` 卻預期是藍色（它是近黑，見 §2.1）
- ❌ 用 `font-heading` 指定標題字型（`--font-sans` 循環未定義，該 utility 目前失效，見 §3）
- ❌ 用 Radix 的 `asChild` 寫 base-ui 元件（要用 `render`）
- ❌ 用 `@media (prefers-color-scheme: dark)`（本專案 `enableSystem={false}`，要用 `dark:`）
- ❌ 在 dashboard 頁面外層加 `max-w-7xl mx-auto`（與側欄版型打架）
- ❌ Emoji 作為圖示
- ❌ 純 placeholder 作為表單 label
- ❌ 操作後無任何 feedback（loading / success / error）
- ❌ 危險操作（刪除/退回/撤銷）無 confirm dialog
- ❌ Mobile 表格超出 viewport 無捲動
- ❌ 硬 coded hex（用 Tailwind color class 或 CSS 變數 token）
- ❌ 低對比度（灰底灰字）
- ❌ 移除 focus ring（或寫了 `outline-none` 沒補 ring）
- ❌ 在 keystroke 時即時驗證（應在 blur 後）
- ❌ 動畫使用 `width` / `height` 過渡（改用 `transform`）
- ❌ 頁面自掛第二個 sonner `<Toaster />`

---

## 13. Pre-Delivery Checklist

每次交付 UI code 前確認：

**視覺**
- [ ] 優先使用 `@/components/ui/*` 現成元件，沒有自刻重複品
- [ ] 圖示全部來自 lucide-react，無 emoji
- [ ] 所有 clickable 元素有 `cursor-pointer`
- [ ] 業務狀態用 `<StatusBadge>`，未自創色票
- [ ] 金額 / 統計數字用 `tabular-nums`
- [ ] 標題用語意標籤 `<h1>`–`<h6>` 或 `font-[Lexend]`（**不要**用 `font-heading`，見 §3）

**深淺色**
- [ ] 每個 `bg-*` / `text-*` / `border-*` 都有對應 `dark:`
- [ ] light 與 dark 兩種模式都實際看過
- [ ] 沒有 `prefers-color-scheme` 寫法

**互動**
- [ ] 按鈕 loading 狀態正確（`Loader2` + `animate-spin` + `disabled`）
- [ ] 危險操作有 confirm dialog
- [ ] 表單送出後有 sonner toast（success / error）
- [ ] 審核類 API 有 AAL2 檢查，前端處理 `MFA_REQUIRED`

**RWD**
- [ ] 375px 寬無水平溢出
- [ ] 表格有 `overflow-x-auto` 或轉 card
- [ ] 觸控目標 ≥44px（共用 Button 靠 `pointer-coarse:min-h-11`，手刻要自己補）
- [ ] BottomNav 不超過 5 格；新增選單項已同步 Sidebar / BottomNav / feature flag

**無障礙**
- [ ] icon-only 按鈕有（i18n 的）`aria-label`
- [ ] 每個 input 有關聯 label
- [ ] Focus ring 可見（元件層 `ring-ring`，手刻層 `ring-blue-600`）
- [ ] 可排序表頭有 `aria-sort`
- [ ] 狀態資訊不只靠顏色傳達

**i18n**
- [ ] 所有文字走 `useTranslations()` / `getTranslations()`，無硬編中文
- [ ] `zh-TW` / `en` / `ja` 三檔 key 完整且結構一致
- [ ] `aria-label`、`placeholder`、toast、空狀態文字也都走 i18n

---

## 14. 本文件的維護方式

**程式碼是唯一真實來源，本文件是它的索引與約定。** 本檔曾長期停留在 Next 14 / Radix / `blue-600` 為 primary 的舊描述，導致照文件寫出來的元件與實作不符 —— 為避免再次發生：

### 14.1 canonical 檔案清單

改動這些檔案時，**同一個 commit 內**一併更新本文件對應章節：

| 檔案 | 對應章節 |
|------|----------|
| `package.json` | Tech Stack 表 |
| `src/app/globals.css` | §2.1 token、§2.4 深淺色、§3 字型 |
| `src/components/ui/button.tsx` + `button-variants.ts` | §5.1 |
| `src/components/ui/badge.tsx` | §5.2 |
| `src/components/StatusBadge.tsx` | §2.3、§5.2 |
| `src/components/ui/dialog.tsx`、`sheet.tsx` | §5.5 |
| `src/components/ui/form.tsx`、`input.tsx`、`label.tsx`、`select.tsx`、`textarea.tsx` | §5.4 |
| `src/components/ui/table.tsx`、`src/components/procurement/table-tools.tsx` | §5.3 |
| `src/components/layout/Sidebar.tsx`、`SidebarDrawer.tsx`、`BottomNav.tsx` | §5.6、§4 版型、§7 斷點 |
| `src/components/layout/PageHeader.tsx` | §5.9 |
| `src/app/(dashboard)/layout.tsx`、`src/app/layout.tsx` | §4 版型、§6 Toast、§2.4 主題 |
| `src/proxy.ts` + 各審核 API route | §6 MFA |
| `src/i18n/config.ts`、`src/messages/*.json` | §10 i18n、§13 checklist |

### 14.2 寫法規則

- 本文件用**繁體中文**，保留 §1–§14 章節編號；新增內容以「補一個子節」為優先，不重排編號。
- 描述樣式時**寫實際的 Tailwind class 或 token 名**，不要只寫 hex 或抽象名詞 —— 這樣才驗證得動。
- 遇到「文件與程式碼不一致」時：**先確認程式碼是不是 bug**。若程式碼是對的 → 改文件；若程式碼是漏改的 → 開 ticket 修程式碼，並在文件標注「已知缺口」（如 §3 的 `--font-sans`）。
- 兩種寫法並存（如 §2 的雙色彩層、§8 的雙 focus ring）時，**兩種都寫出來並說明各自適用範圍**，不要只寫理想那一種然後假裝另一種不存在。
- 不確定某規則是否還有效時，用 `grep` 數一下使用量再決定是「現行慣例」、「舊慣例（勿新用）」還是「已失效（刪除）」。
