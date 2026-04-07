# PRD：myOPS v0.3.0 — Teams Bot 整合

> **版本：** v0.3.0  
> **目標：** 完成 Microsoft Teams Bot 主動通知功能，讓系統事件（請假審核、薪資發放、公告發布、打卡提醒）能自動推送到員工的 Teams 個人訊息。

---

## 一、背景與現況

### 1.1 已有的骨架（v0.2.x 建立）

系統已建立三個 Teams API route，但均未真正發送訊息：

| Route | 設計用途 | 現況 |
|-------|---------|------|
| `POST /api/teams/daily-digest` (T55) | 每日早上匯整待處理事項 | 邏輯完成，只有 `console.log` |
| `POST /api/teams/notify` (T56) | 即時事件通知 | TODO，完全未實作 |
| `POST /api/teams/clock-reminder` (T57) | 上下班打卡提醒 | 邏輯完成，只有 `console.log` |

### 1.2 缺少的核心基礎設施

1. **Azure Bot 未註冊** — 沒有 Bot App ID / Secret 可以發訊息
2. **沒有 conversation reference 機制** — Bot 不知道要傳給誰（Teams user ID）
3. **Bot Webhook endpoint 不存在** — Teams 無法向系統送訊息（也就無法建立 conversation）
4. **沒有 Vercel cron 設定** — daily-digest / clock-reminder 不會自動觸發
5. **事件觸發點未接線** — 請假審核、薪資產出等事件發生時沒有呼叫 notify

### 1.3 設計原則

- **通知不擾民**：daily digest 每日一次，不逐筆轟炸
- **Proactive messaging**：Bot 主動傳訊，不需員工去 Bot 頁面查詢
- **優雅降級**：Teams Bot 未設定或發送失敗時，系統正常運作，不 block 主流程
- **不使用 Bot SDK**：直接呼叫 Microsoft Bot Framework REST API，不安裝 `botbuilder`

---

## 二、技術架構

### 2.1 運作流程

```
員工 → Teams → Azure Bot Service → /api/teams/bot (T63)
  └─ Bot 儲存 conversation reference 到 DB (T64)

後續主動推播：
myOPS → teams-bot.ts (T65) → Bot Framework REST API → Azure Bot Service → Teams → 員工
```

### 2.2 需要的環境變數

| 變數 | 說明 |
|------|------|
| `TEAMS_BOT_APP_ID` | Azure App Registration 的 Application (client) ID |
| `TEAMS_BOT_APP_SECRET` | Azure App Registration 的 Client Secret |
| `CRON_SECRET` | Vercel Cron 呼叫 API 的驗證 token |

---

## 三、Task 清單

### T63 — Azure Bot 設定文件（手動操作）

- **類型：** 文件 / 手動操作（非程式碼）
- **內容：**
  - 在 Azure Portal 建立 App Registration
  - 建立 Azure Bot Service（multi-tenant）
  - 設定 Messaging Endpoint → `https://ops.cancerfree.io/api/teams/bot`
  - 把 Bot 安裝到 Teams（上傳 App Manifest 或透過 Teams Admin Center）
  - 把 `TEAMS_BOT_APP_ID` / `TEAMS_BOT_APP_SECRET` 設到 Vercel 環境變數
- **產出：** `docs/teams-bot-setup.md`
- **AC：** Bot 在 Teams 出現且可收訊息；Vercel 環境變數已設定

---

### T64 — DB：新增 `teams_conversation_references` 表

- **類型：** Migration
- **路徑：** `supabase/migrations/20260407000006_teams_conversation_references.sql`
- **Schema：**
  ```sql
  CREATE TABLE teams_conversation_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teams_user_id TEXT NOT NULL,
    service_url TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    channel_id TEXT DEFAULT 'msteams',
    tenant_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id)
  );
  ```
- **RLS：** 僅 service role 可讀寫
- **AC：** Migration 成功，表存在

---

### T65 — Bot Framework 工具函式

- **類型：** 新 lib 檔
- **路徑：** `src/lib/teams-bot.ts`
- **函式：**
  ```typescript
  getBotToken(): Promise<string>
  // Microsoft client credentials flow，快取至快過期

  sendProactiveMessage(userId: string, text: string): Promise<void>
  // 查 conversation reference → Bot Framework REST API → 發訊
  // 無 conversation reference 時 skip + log，不 throw

  sendProactiveMessages(messages: { userId: string; text: string }[]): Promise<{ sent: number; failed: number }>
  // 批次發送，用於 daily digest
  ```
- **AC：** 可成功發送測試訊息給有 conversation reference 的 user

---

### T66 — Bot Webhook endpoint

- **類型：** 新 API route
- **路徑：** `src/app/api/teams/bot/route.ts`
- **功能：**
  - 驗證 Bot Framework JWT token
  - `conversationUpdate` activity → 儲存 conversation reference（呼叫 T64 的表）
  - `message` activity → 回覆 help 訊息
  - 透過 `activity.from.aadObjectId` 對應 myOPS `users` 表
- **AC：**
  - Teams 能呼叫此 endpoint 不報錯
  - 員工第一次私訊 Bot 後，DB 有對應 conversation reference

---

### T67 — 完成 `/api/teams/daily-digest`

- **類型：** 修改現有 route (T55)
- **路徑：** `src/app/api/teams/daily-digest/route.ts`
- **改動：** `console.log(...)` → `sendProactiveMessage(u.id, lines.join('\n'))`
- **訊息格式：**
  ```
  📋 {name}，你今天有 {n} 件待處理：
    ⏰ {n} 筆請假待審核
    📄 {n} 份合約待審核
    📣 {n} 則公告未確認
  👉 前往 myOPS：https://ops.cancerfree.io
  ```
- **i18n：** 根據 `users.language` 選中/英/日
- **AC：** Cron 觸發後，有 conversation reference 的 user 收到 Teams 訊息

---

### T68 — 完成 `/api/teams/clock-reminder`

- **類型：** 修改現有 route (T57)
- **路徑：** `src/app/api/teams/clock-reminder/route.ts`
- **改動：** `console.log(...)` → `sendProactiveMessage(...)`
- **訊息範例：**
  - 上班：`⏰ 別忘了打上班卡！👉 https://ops.cancerfree.io/attendance`
  - 下班：`🏠 下班了，記得打下班卡！👉 https://ops.cancerfree.io/attendance`
- **AC：** Cron 觸發後，未打卡的 user 收到 Teams 提醒

---

### T69 — 完成 `/api/teams/notify`

- **類型：** 修改現有 route (T56)
- **路徑：** `src/app/api/teams/notify/route.ts`
- **改動：** TODO → `sendProactiveMessage(userId, message)`
- **請求格式：**
  ```typescript
  { user_id: string, message: string, type: 'leave' | 'payroll' | 'announcement' | 'contract' }
  ```
- **AC：** 呼叫後目標 user 收到 Teams 訊息

---

### T70 — 請假審核結果通知

- **類型：** 修改現有 route
- **路徑：** `src/app/api/leave/requests/[id]/route.ts`
- **觸發點：** approve / reject 後，呼叫 `/api/teams/notify`
- **訊息：**
  - 通過：`✅ 你的請假申請（{日期}）已通過審核`
  - 拒絕：`❌ 你的請假申請（{日期}）已被拒絕：{拒絕原因}`
- **AC：** 審核完成後申請人收到 Teams 訊息

---

### T71 — 薪資單發出通知

- **類型：** 修改現有 route
- **路徑：** `src/app/api/payroll/generate-monthly/route.ts`
- **觸發點：** 薪資單產出後
- **訊息：** `💰 {月份} 薪資單已發出，請至 myOPS 查看`
- **AC：** 薪資產出後員工收到 Teams 訊息

---

### T72 — 公告發布通知

- **類型：** 修改現有 route
- **路徑：** `src/app/api/documents/[id]/publish/route.ts`
- **觸發點：** 公告發布後（requires_confirmation 的公告）
- **訊息：** `📢 新公告：{標題}，請至 myOPS 閱讀並確認`
- **AC：** 發布後收件人收到 Teams 訊息

---

### T73 — Vercel Cron 設定

- **類型：** 新檔
- **路徑：** `vercel.json`
- **內容：**
  ```json
  {
    "crons": [
      { "path": "/api/teams/daily-digest", "schedule": "30 0 * * 1-5" },
      { "path": "/api/teams/clock-reminder", "schedule": "0 23 * * 1-5" },
      { "path": "/api/teams/clock-reminder", "schedule": "30 9 * * 1-5" }
    ]
  }
  ```
  > UTC 時間：00:30 = 台灣 08:30；23:00 = 台灣 07:00（上班提醒）；09:30 = 台灣 17:30（下班提醒）
- **AC：** Vercel 顯示 Cron Jobs 已設定，定時觸發不報錯

---

## 四、Acceptance Criteria 總覽

| Task | AC | 驗證方式 |
|------|----|---------|
| T63 | Bot 在 Teams 出現 | Teams 搜尋 Bot 名稱可找到 |
| T64 | 表存在 | 查 Supabase 表清單 |
| T65 | 可發送測試訊息 | 手動呼叫，Teams 收到訊息 |
| T66 | Webhook 運作 | 私訊 Bot 後 DB 有 conversation reference |
| T67 | Daily digest 發出 | Cron 觸發後 Teams 收到 |
| T68 | 打卡提醒發出 | 手動呼叫，未打卡者收到 |
| T69 | Notify 發出 | 呼叫 API，目標 user 收到 |
| T70 | 請假審核通知 | 審核後申請人收到 |
| T71 | 薪資通知 | 薪資產出後員工收到 |
| T72 | 公告通知 | 發布後收件人收到 |
| T73 | Cron 定時觸發 | Vercel Logs 有執行記錄 |

---

## 五、注意事項

- **冷啟動：** Bot 主動傳訊前 user 必須先私訊 Bot 一次。初期 conversation reference 可能缺漏，`sendProactiveMessage` 應 skip + log，不報錯
- **Bot token 快取：** `getBotToken()` 快取 token 至快過期（約 55 分鐘），避免每次發訊都重新取得
- **i18n：** Bot 訊息語言根據 `users.language` 選 zh-TW / en / ja

---

*PRD 版本：v0.3.0-draft | 建立日期：2026-04-07*
