# UI Patterns 規範

> Claude Code 在實作 UI 時必須遵守以下規範。涵蓋元件架構、表單、資料 fetch、載入狀態、錯誤處理。

---

## Server Component vs Client Component

### 決策規則

```
預設使用 Server Component
只有在以下情況才加 'use client'：
```

| 需要 'use client' | 保持 Server Component |
|-------------------|----------------------|
| useState / useEffect | 靜態展示資料 |
| 事件處理（onClick 等） | 資料庫查詢 |
| 瀏覽器 API（localStorage 等） | async/await fetch |
| react-hook-form | 頁面 Layout |
| 即時互動元件 | SEO 重要頁面 |

### 架構模式

```
app/(dashboard)/contacts/page.tsx        ← Server Component，fetch 資料
  └── ContactList.tsx                    ← Server Component，接收 props
        └── ContactCard.tsx              ← Server Component，純展示
              └── DeleteButton.tsx       ← 'use client'，有 onClick
```

**禁止**：在 Server Component 裡 import 'use client' 元件以外的 client-only API。

---

## shadcn/ui 使用規範

### 安裝

```bash
npx shadcn@latest init
# 選擇：Default style, CSS variables, Tailwind
```

### 常用元件與使用時機

| 元件 | 使用時機 |
|------|---------|
| `Button` | 所有按鈕，禁止自己寫 `<button>` 樣式 |
| `Input` / `Textarea` | 所有表單欄位 |
| `Select` | 下拉選單 |
| `Dialog` | Modal / 確認對話框 |
| `Sheet` | 手機 Drawer Sidebar |
| `Skeleton` | 載入佔位符 |
| `Badge` | 狀態標籤 |
| `Table` | 桌面資料表格 |
| `Card` | 手機資料卡片 |
| `Tooltip` | 說明提示（配合 next-intl） |
| `Separator` | 分隔線 |
| `Avatar` | 使用者頭像 |

### 新增元件

```bash
npx shadcn@latest add button input dialog sheet skeleton
```

---

## 表單處理（zod + react-hook-form）

### 標準結構

```typescript
// 1. 定義 schema（與元件分離，放 lib/schemas/ 或元件同層）
const contactSchema = z.object({
  name: z.string().min(1, { message: '必填' }),
  email: z.string().email({ message: '格式不正確' }),
  role: z.enum(['member', 'admin']),
})

type ContactFormValues = z.infer<typeof contactSchema>

// 2. 元件加 'use client'
export function ContactForm() {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', role: 'member' },
  })

  async function onSubmit(values: ContactFormValues) {
    try {
      await saveContact(values)
      toast.success('儲存成功')
    } catch {
      toast.error('儲存失敗，請稍後再試')
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>姓名</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? '儲存中...' : '儲存'}
        </Button>
      </form>
    </Form>
  )
}
```

### 規則

- 每個表單必須有 zod schema，不得用 `any`
- 錯誤訊息從 i18n `errors.*` 取得，不 hardcode
- submit 期間 Button 必須 `disabled`
- 成功 / 失敗必須用 toast 回饋

---

## Toast 通知（sonner）

### 安裝與設定

```bash
npm install sonner
```

```typescript
// app/layout.tsx（Root Layout）
import { Toaster } from 'sonner'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
```

### 使用規則

```typescript
import { toast } from 'sonner'

// 成功
toast.success('儲存成功')

// 失敗
toast.error('操作失敗，請稍後再試')

// 載入中（async 操作）
toast.promise(saveContact(values), {
  loading: '儲存中...',
  success: '儲存成功',
  error: '儲存失敗',
})
```

**規則**：
- 所有 CRUD 操作必須有 toast 回饋
- 錯誤訊息不得顯示技術細節（不 expose DB 錯誤）
- 用 `toast.promise` 處理 async，避免手動 loading 狀態

---

## Loading 狀態（Skeleton）

### Server Component 用 Suspense

```typescript
// page.tsx
import { Suspense } from 'react'
import { ContactListSkeleton } from '@/components/contacts/ContactListSkeleton'

export default function ContactsPage() {
  return (
    <Suspense fallback={<ContactListSkeleton />}>
      <ContactList />
    </Suspense>
  )
}
```

### Skeleton 元件規範

```typescript
// components/contacts/ContactListSkeleton.tsx
import { Skeleton } from '@/components/ui/skeleton'

export function ContactListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

**規則**：
- 每個有 async data 的區塊必須有對應的 Skeleton
- Skeleton 形狀必須接近實際內容（高度、寬度、間距）
- 禁止用 spinner 作為唯一的 loading 指示

---

## 資料 Fetch 規範

### Server Component fetch（優先）

```typescript
// 直接在 Server Component 裡 async/await
async function ContactList() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error  // 由 error.tsx 處理

  return <ul>{data.map(c => <ContactCard key={c.id} contact={c} />)}</ul>
}
```

### Client Component fetch（需要即時更新時）

```typescript
// 用 SWR 或直接 useEffect + fetch API route
'use client'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function ContactStats() {
  const { data, isLoading } = useSWR('/api/contacts/stats', fetcher)
  if (isLoading) return <Skeleton className="h-8 w-24" />
  return <span>{data?.total}</span>
}
```

### API Route 錯誤格式

```typescript
// 統一錯誤回應格式
export async function GET() {
  try {
    // ...
    return NextResponse.json({ data })
  } catch (error) {
    console.error('[API] contacts GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

**規則**：
- Server Component 能 fetch 的就不用 API route
- API route 只用於：Client Component fetch、外部 webhook、需要 service role key 的操作
- 錯誤一律 `console.error` + 回傳 generic message（不 expose 細節）

---

## 頁面 Layout 規範

### Dashboard Layout 標準尺寸

```typescript
// Sidebar
const SIDEBAR_WIDTH = 'w-64'        // 256px，桌面展開
const SIDEBAR_COLLAPSED = 'w-16'    // 64px，桌面收折（選用）

// Header
const HEADER_HEIGHT = 'h-14'        // 56px

// Content padding
const CONTENT_PADDING = 'p-6'       // 桌面
const CONTENT_PADDING_MOBILE = 'p-4' // 手機
```

### 標準 Dashboard Layout 結構

```tsx
// app/(dashboard)/layout.tsx
export default function DashboardLayout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — 桌面顯示，手機隱藏 */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-background">
        <Sidebar />
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="h-14 border-b flex items-center px-4">
          {/* Mobile menu trigger + 頁面標題 */}
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
        <footer className="h-8 border-t flex items-center px-4 text-xs text-muted-foreground">
          <Footer />
        </footer>
      </div>

      {/* Mobile Drawer Sidebar */}
      <Sheet>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>
    </div>
  )
}
```

---

## Modal / Dialog 規範

```typescript
'use client'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

// 規則：
// - 破壞性操作（刪除）必須有確認 Dialog
// - Dialog 關閉後狀態要重置（onOpenChange 裡 reset form）
// - 手機上 Dialog 改用 Sheet（bottom sheet）

export function DeleteConfirmDialog({ onConfirm, open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>確認刪除？</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">此操作無法復原。</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="destructive" onClick={onConfirm}>刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```
