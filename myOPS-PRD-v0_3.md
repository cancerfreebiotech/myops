# PRD：myOPS v0.3.0 — Teams Bot 整合

> **版本：** v0.3.0  
> **目標：** 完成 Microsoft Teams Bot 主動通知功能，讓系統事件（請假審核、薪資發放、公告發布、打卡提醒）能自動推送到員工的 Teams 個人訊息。

---

## 一、背景與現況

### 1.1 已有的骨架（v0.2.x 建立）

系統已建立三個 Teams API route，但均未真正發送訊息：

| Route | 設計用途 | 現況 |
|-------|---------|------|
| `POST /api/teams/daily-digest` | 每日早上匯整待處理事項 | 邏輯完成，只有 `console.log` |
| `POST /api/teams/clock-reminder` | 上下班打卡提醒 | 邏輯完成，只有 `console.log` |
| `POST /api/teams/notify` | 即時事件通知 | TODO，完全未實作 |

### 1.2 缺少的核心基礎設施

1. **Azure Bot 未註冊** — 沒有 Bot App ID / Secret 可以發訊息
2. **沒有 conversation reference 機制** — Bot 不知道要傳給誰（Teams user ID）
3. **Bot Webhook endpoint 不存在** — Teams 無法向系統送訊息（也就無法建立 conversation）
4. **沒有 Vercel cron 設定** — daily-digest / clock-reminder 不會自動觸發
5. **事件觸發點未接線** — 請假審核、薪資產出等事件發生時沒有呼叫 notify

### 1.3 設計原則（沿用 PRD v0.1）

- **通知不擾民**：daily digest 每日一次，不逐筆轟炸
- **Proactive messaging**：Bot 主動傳訊，不需員工去 Bot 頁面查詢
- **優雅降級**：Teams Bot 未設定或發送失敗時，系統正常運作，不 block 主流程

---

## 二、技術架構

### 2.1 Microsoft Teams Bot 運作方式

```
員工 → Teams → Bot Channel → Azure Bot Service
                                     ↕
                              /api/teams/bot  (Webhook)
                                     ↕
                            myOPS 儲存 conversation reference

後續主動推播：
myOPS → Bot Framework API → Azure Bot Service → Teams → 員工
```

### 2.2 需要的環境變數

| 變數 | 說明 |
|------|------|
| `TEAMS_BOT_APP_ID` | Azure App Registration 的 Application (client) ID |
| `TEAMS_BOT_APP_SECRET` | Azure App Registration 的 Client Secret |
| `CRON_SECRET` | Vercel Cron 呼叫 API 的驗證 token |

> `TEAMS_BOT_APP_ID` 和 `TEAMS_BOT_APP_SECRET` 已在 `system_settings` 有欄位，需同步設定到 Vercel 環境變數。

### 2.3 Conversation Reference 流程

```
1. Bot 被加入 Teams Channel 或員工私訊 Bot
2. Teams 呼叫 /api/teams/bot (Activity: conversationUpdate / message)
3. myOPS 從 Activity 取出 conversation reference（service_url, conversation_id, user_id_teams）
4. 比對 Activity 中的 email 或 AAD Object ID 找到 myOPS user_id
5. 儲存到 DB teams_conversation_references 表
6. 之後任何需要通知時，用 user_id 查出 conversation reference，呼叫 Bot Framework API 發訊
```

---

## 三、Task 清單

### Phase 1：基礎設施（必做）

#### T1 — Azure Bot 設定文件
- **類型：** 文件 / 手動操作
- **內容：**
  - 在 Azure Portal 建立 App Registration
  - 建立 Azure Bot Service（multi-tenant）
  - 設定 Messaging Endpoint → `https://ops.cancerfree.io/api/teams/bot`
  - 把 Bot 安裝到 Teams（上傳 App Manifest 或透過 Teams Admin Center）
  - 把 `TEAMS_BOT_APP_ID` / `TEAMS_BOT_APP_SECRET` 設到 Vercel 環境變數
- **產出：** `docs/teams-bot-setup.md`（操作指南）
- **AC：** Bot 在 Teams 出現且可收訊息

---

#### T2 — DB：新增 `teams_conversation_references` 表
- **類型：** Migration
- **Schema：**
  ```sql
  CREATE TABLE teams_conversation_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teams_user_id TEXT NOT NULL,          -- Teams AAD Object ID
    service_url TEXT NOT NULL,            -- e.g. https://smba.trafficmanager.net/...
    conversation_id TEXT NOT NULL,
    channel_id TEXT DEFAULT 'msteams',
    tenant_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id)                      -- 每個 user 只保留最新一筆
  );
  ```
- **RLS：** 僅 service role 可讀寫
- **AC：** Migration 成功，表存在

---

#### T3 — Bot Webhook endpoint (`/api/teams/bot`)
- **類型：** 新 API route
- **路徑：** `src/app/api/teams/bot/route.ts`
- **功能：**
  - 驗證 Bot Framework JWT token（防止偽造）
  - 處理 `conversationUpdate` activity → 儲存 conversation reference
  - 處理 `message` activity → 回覆簡單 help 訊息
  - 比對 `activity.from.aadObjectId` 對應 myOPS `users` 表的 AAD ID
- **AC：**
  - Teams 能呼叫此 endpoint 不報錯
  - 員工第一次私訊 Bot 後，DB 有對應的 conversation reference

---

#### T4 — Bot Framework 工具函式
- **類型：** 新 lib 檔
- **路徑：** `src/lib/teams-bot.ts`
- **函式：**
  ```typescript
  // 取得 Bot Framework access token（Microsoft client credentials）
  async function getBotToken(): Promise<string>
  
  // 根據 user_id 查 conversation reference，發送主動訊息
  async function sendProactiveMessage(userId: string, text: string): Promise<void>
  
  // 批次發送（daily digest 用）
  async function sendProactiveMessages(messages: { userId: string; text: string }[]): Promise<{ sent: number; failed: number }>
  ```
- **錯誤處理：** 找不到 conversation reference、Bot token 取得失敗、發送失敗，全部 log 但不 throw（不影響主流程）
- **AC：** 可以成功發送測試訊息給有 conversation reference 的 user

---

### Phase 2：完成現有 API Routes

#### T5 — 完成 `/api/teams/daily-digest`
- **修改：** `src/app/api/teams/daily-digest/route.ts`
- **改動：** 把 `console.log(...)` 替換為 `sendProactiveMessage(u.id, lines.join('\n'))`
- **訊息格式（Adaptive Card 或純文字）：**
  ```
  📋 王小明，你今天有 3 件待處理：
    ⏰ 2 筆請假待審核
    📄 1 份合約待審核
  👉 前往 myOPS：https://ops.cancerfree.io
  ```
- **AC：** Cron 觸發後，有 conversation reference 的 user 收到 Teams 訊息

---

#### T6 — 完成 `/api/teams/clock-reminder`
- **修改：** `src/app/api/teams/clock-reminder/route.ts`
- **改動：** 把 `console.log(...)` 替換為 `sendProactiveMessage(...)`
- **訊息範例：**
  - 上班提醒：`⏰ 別忘了打上班卡！👉 https://ops.cancerfree.io/attendance`
  - 下班提醒：`🏠 下班了，記得打下班卡！👉 https://ops.cancerfree.io/attendance`
- **AC：** Cron 觸發後，未打卡的 user 收到 Teams 提醒

---

#### T7 — 完成 `/api/teams/notify`
- **修改：** `src/app/api/teams/notify/route.ts`
- **改動：** 用 `sendProactiveMessage(userId, message)` 替換 TODO
- **呼叫格式：**
  ```typescript
  POST /api/teams/notify
  { user_id: string, message: string, type: 'leave' | 'payroll' | 'announcement' | 'contract' }
  ```
- **AC：** 呼叫後目標 user 收到 Teams 訊息

---

### Phase 3：接線事件觸發點

#### T8 — 請假審核結果通知
- **修改：** `src/app/api/leave/requests/[id]/route.ts`
- **觸發點：** approve / reject 動作完成後
- **訊息：**
  - 通過：`✅ 你的請假申請（{日期}）已通過審核`
  - 拒絕：`❌ 你的請假申請（{日期}）已被拒絕：{拒絕原因}`
- **AC：** 審核完成後申請人收到 Teams 訊息

---

#### T9 — 薪資單發出通知
- **修改：** `src/app/api/payroll/generate-monthly/route.ts` 或薪資確認相關 route
- **觸發點：** 薪資單產出 / 確認後
- **訊息：** `💰 {月份} 薪資單已發出，請至 myOPS 查看`
- **AC：** 薪資產出後員工收到 Teams 訊息

---

#### T10 — 公告發布通知
- **修改：** `src/app/api/documents/[id]/publish/route.ts`
- **觸發點：** 公告發布後（對 requires_confirmation 的公告）
- **訊息：** `📢 新公告：{公告標題}，請至 myOPS 閱讀並確認`
- **AC：** 公告發布後收件人收到 Teams 訊息

---

### Phase 4：Cron 設定

#### T11 — 新增 `vercel.json` 設定 Cron Jobs
- **新增：** `vercel.json`
- **內容：**
  ```json
  {
    "crons": [
      {
        "path": "/api/teams/daily-digest",
        "schedule": "30 0 * * 1-5"
      },
      {
        "path": "/api/teams/clock-reminder",
        "schedule": "0 23 * * 1-5"
      },
      {
        "path": "/api/teams/clock-reminder",
        "schedule": "0 9 * * 1-5"
      }
    ]
  }
  ```
  > 時間為 UTC，對應台灣時間：08:30 daily digest、17:00 上班提醒（backup）、17:00 下班提醒

- **AC：** Vercel 顯示 Cron Jobs 已設定，定時觸發不報錯

---

## 四、Acceptance Criteria 總覽

| # | AC | 驗證方式 |
|---|----|---------|
| 1 | Bot 在 Teams 出現 | Teams 搜尋 Bot 名稱可找到 |
| 2 | 員工私訊 Bot 後 DB 有 conversation reference | 查 `teams_conversation_references` 表 |
| 3 | Daily digest 有實際傳出 | Cron 觸發後 Teams 收到訊息 |
| 4 | 打卡提醒有實際傳出 | 手動呼叫 clock-reminder API，未打卡者收到訊息 |
| 5 | 請假審核結果傳出 | 審核通過 / 拒絕後申請人收到訊息 |
| 6 | 薪資單傳出 | 薪資產出後員工收到訊息 |
| 7 | 公告通知傳出 | 發布公告後收件人收到訊息 |
| 8 | Bot 未設定時系統正常運作 | 清空 `TEAMS_BOT_APP_ID`，主流程不報錯 |
| 9 | Cron 定時觸發 | Vercel Logs 顯示 Cron 執行記錄 |

---

## 五、注意事項

### 5.1 Conversation Reference 冷啟動問題

Bot 主動傳訊前，user 必須先主動和 Bot 互動一次（或 Admin 把 Bot push 給所有人）。初期可能很多員工沒有 conversation reference，`sendProactiveMessage` 應優雅降級（skip + log），不報錯。

### 5.2 i18n

Bot 訊息語言應根據 `users.language` 欄位選擇（zh-TW / en / ja）。

### 5.3 Bot Token 快取

`getBotToken()` 應快取 token 直到快過期（token 有效期 ~1 小時），避免每次發訊都重新取得。

### 5.4 不需要 Bot SDK

使用 Microsoft Bot Framework REST API 直接呼叫即可，不需安裝 `botbuilder` SDK（避免增加 bundle size）。

---

## 六、Task 執行順序建議

```
T1（Azure 設定）→ T2（DB migration）→ T3（Bot webhook）→ T4（工具函式）
→ T5 + T6 + T7（完成 API routes）
→ T8 + T9 + T10（接線事件觸發）
→ T11（Cron 設定）
```

T1 需要人工在 Azure Portal 操作，其他 T2–T11 可由 Claude Code 實作。

---

*PRD 版本：v0.3.0-draft | 建立日期：2026-04-07*
