# PRD：Dr.Ave — 共用 Teams Bot Gateway

> **專案名稱：** Dr.Ave  
> **版本：** v0.1-draft  
> **定位：** 精拓生技所有內部系統共用的 Microsoft Teams Bot 服務  
> **建立日期：** 2026-04-07

---

## 一、背景與目標

### 1.1 問題

精拓生技目前有多個內部系統（myCRM、myOPS，未來可能更多），每個系統都需要透過 Teams Bot 發送通知給員工。如果每個系統各自維護 Bot 設定，會造成：

- 多個 Azure App Registration
- 多個 Messaging Endpoint
- Conversation reference 分散，無法跨系統查詢
- Bot 邏輯重複開發

### 1.2 解法

建立一個獨立的 **Bot Gateway 服務**，統一處理所有 Teams Bot 互動。其他系統只需呼叫一個簡單的 API 即可發送訊息。

### 1.3 目標

- 一個 Azure Bot App Registration 供所有系統共用
- 集中儲存所有員工的 conversation reference
- 提供簡單的 `POST /api/notify` 供其他系統呼叫
- 未來可擴充支援 Bot 指令、互動式訊息（Adaptive Card）

---

## 二、系統架構

```
Microsoft Teams
      ↕
Azure Bot Service (App ID: 1c7e5469-...)
      ↕ Messaging Endpoint
https://bot.cancerfree.io/api/teams/bot
      ↕
   Dr.Ave (Vercel)
   ├── /api/teams/bot     接收 Teams 活動
   └── /api/notify        供其他系統呼叫

      ↑                ↑                ↑
    myOPS           myCRM          future apps
```

### 2.1 技術棧

```
Framework:   Next.js (App Router + TypeScript)
Database:    Supabase（獨立專案）
Deploy:      Vercel
Domain:      bot.cancerfree.io
Auth:        API Key（其他系統呼叫 /api/notify 時驗證）
```

### 2.2 環境變數

| 變數 | 說明 |
|------|------|
| `TEAMS_BOT_APP_ID` | Azure App Registration Application ID |
| `TEAMS_BOT_APP_SECRET` | Azure App Registration Client Secret |
| `NOTIFY_API_KEY` | 其他系統呼叫 /api/notify 的驗證 key |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

---

## 三、資料庫設計

### `conversation_references` 表

```sql
CREATE TABLE conversation_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 識別 user
  aad_object_id TEXT NOT NULL,        -- Teams / AAD Object ID
  email TEXT,                          -- 對應的 email（方便跨系統查詢）
  display_name TEXT,
  -- Bot Framework 需要的資料
  service_url TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  channel_id TEXT DEFAULT 'msteams',
  tenant_id TEXT,
  -- metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (aad_object_id)
);
```

> 不直接存各系統的 user_id，改用 `email` 或 `aad_object_id` 跨系統識別。

---

## 四、API 規格

### 4.1 `POST /api/teams/bot`（Webhook，供 Azure Bot Service 呼叫）

- 驗證 Bot Framework JWT token
- 處理 `conversationUpdate`：儲存 / 更新 conversation reference
- 處理 `message`：回覆 help 訊息
- 不對外公開（只有 Azure Bot Service 呼叫）

### 4.2 `POST /api/notify`（供其他系統呼叫）

**Request Header：**
```
Authorization: Bearer {NOTIFY_API_KEY}
```

**Request Body：**
```typescript
{
  to: string,           // email 或 aad_object_id
  message: string,      // 純文字訊息
  source?: string,      // 來源系統，e.g. 'myOPS', 'myCRM'（用於 log）
}
```

**Response：**
```typescript
{ ok: true, method: 'teams' | 'skipped' }
// skipped = 找不到 conversation reference，優雅降級
```

**錯誤：**
```typescript
{ error: string }  // 401 / 400 / 500
```

---

## 五、Task 清單

### T1 — 專案初始化

- Next.js App Router + TypeScript
- Supabase 新專案
- Vercel 新專案，設定 `bot.cancerfree.io`
- 環境變數設定

### T2 — DB Migration：`conversation_references` 表

- 建立表（見上方 schema）
- RLS：僅 service role 可讀寫

### T3 — Bot Framework 工具函式 (`src/lib/teams-bot.ts`)

- `getBotToken()` — client credentials flow，快取至快過期
- `sendProactiveMessage(aadObjectId | email, text)` — 查 ref → 發訊，找不到時優雅降級

### T4 — Bot Webhook (`/api/teams/bot`)

- 驗證 JWT
- 處理 `conversationUpdate` → 儲存 conversation reference
- 處理 `message` → 回覆 help

### T5 — Notify API (`/api/notify`)

- API Key 驗證
- 用 email 或 aad_object_id 查 conversation reference
- 呼叫 `sendProactiveMessage`

### T6 — 更新 Azure Bot Messaging Endpoint

- 將 Azure Bot Service Messaging Endpoint 改為 `https://bot.cancerfree.io/api/teams/bot`
- 確認 myCRM / myOPS 現有 Bot 功能不受影響（若有）

### T7 — myOPS 串接

- 移除 myOPS 內部的 Bot Framework 邏輯
- 改為呼叫 `POST https://bot.cancerfree.io/api/notify`
- 更新 T67–T72（daily-digest、clock-reminder、notify、各事件觸發）

### T8 — myCRM 串接（視 myCRM 現況而定）

---

## 六、待確認事項

1. **Domain：** `bot.cancerfree.io` 可以嗎？還是其他？
2. **Supabase：** 新開獨立專案，還是共用 myOPS 的？
3. **myCRM 現況：** myCRM 目前有沒有在用 Dr.Ave Bot 發訊息？需要 migrate 嗎？
4. **Bot 名稱：** Teams 上顯示的名稱還是 Dr.Ave 嗎？

---

*PRD 版本：v0.1-draft | 建立日期：2026-04-07*
