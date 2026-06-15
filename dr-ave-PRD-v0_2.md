# PRD：Dr.Ave — 共用 Teams Bot Gateway（v0.2）

> **專案名稱：** Dr.Ave
> **版本：** v0.2-draft（接續 v0.1，2026-06-14 擴充）
> **定位：** 精拓生技所有內部系統共用的 Microsoft Teams Bot 服務
> **本版範圍：** ① 通知中樞（外送）② 可操作簽核卡片 ③ 互動查詢指令（不含 ④ myCRM 排會議）

---

## 一、架構總覽

```
Microsoft Teams
      ↕  (一個 bot、一個端點)
Azure Bot Service (沿用既有 App ID 1c7e5469-…，收編為 Dr.Ave 共用 app)
      ↕  Messaging Endpoint = https://bot.cancerfree.io/api/teams/bot
      ↕
   Dr.Ave (Next.js / Vercel / 獨立 Supabase)
   ├── /api/teams/bot   ← Teams 來的所有活動（訊息、卡片按鈕、安裝事件）
   ├── /api/notify      ← 各系統呼叫：發通知 / 發可操作卡片
   └── 路由層           → 依 payload 回呼來源系統的 bot-facing API
        ↑ 外送            ↓ inbound 回呼（帶服務 token）
   myCRM / myOPS（各自提供 bot-facing endpoints）
```

**核心原則**：Dr.Ave 不懂業務邏輯。它只做四件事——驗 Teams JWT、記 conversation reference、外送訊息/卡片、把 inbound 事件**路由回**擁有該功能的系統。業務判斷（誰能簽、剩幾天假）一律由來源系統回答。

---

## 二、資料庫（獨立 Supabase 專案）

### `conversation_references`（沿用 v0.1）
`aad_object_id`(UNIQUE) / `email` / `display_name` / `service_url` / `conversation_id` / `tenant_id` / 時間戳。以 email + aad_object_id 跨系統識別，不存各系統 user_id。

### `registered_systems`
| 欄位 | 說明 |
|------|------|
| `key` | 'myops' / 'mycrm' |
| `base_url` | 回呼基底，如 https://ops.cancerfree.io |
| `bot_token` | Dr.Ave 呼叫該系統 bot-facing API 用的共用密鑰（對應該系統的 `BOT_GATEWAY_TOKEN`） |
| `commands` | 該系統註冊的查詢指令前綴（給 ③ 路由用） |

### `card_actions`（②用，可選但建議）
記錄每張可操作卡片：`activity_id` / `system_key` / `action_type`(approve_doc…) / `payload`(docType,docId,stepNo) / `status`。用於回呼後更新卡片、防重複點擊。

---

## 三、API 規格

### 3.1 `POST /api/notify`（各系統 → Dr.Ave，外送）
```
Authorization: Bearer {NOTIFY_API_KEY}
{
  to: string,                 // email 或 aad_object_id
  source: 'myops'|'mycrm',
  message?: string,           // 純文字
  card?: {                    // ② 可操作卡片（與 message 二選一）
    title: string, body: string,
    actions: [{ label, action_type, payload, style? }]   // 按鈕
  }
}
→ { ok: true, method: 'teams'|'skipped' }   // skipped = 查無 ref，優雅降級
```

### 3.2 `POST /api/teams/bot`（Azure → Dr.Ave，inbound）
- 驗 Bot Framework JWT（jose，aud=App ID、iss=Bot Framework）
- `conversationUpdate` → 以成員 email 比對、upsert conversation reference
- `message`（③）→ 解析指令前綴 → 查 `registered_systems` → 轉呼該系統 query API → 把回應格式化回傳
- `invoke`/`messageBack`（② 卡片按鈕）→ 讀 `card_actions` → 帶「點擊者 email」回呼來源系統 action API → 依結果更新卡片（核准成功 → 卡片變「✅ 已由 XXX 核准」）

### 3.3 來源系統需新增的 bot-facing endpoints（帶 `BOT_GATEWAY_TOKEN` 驗證，非使用者 session）
- myOPS `POST /api/bot/approve`：body {email, docType, docId, action}，內部以 email→users 查身分，**重用 approval-engine 的 canActOnStep 授權**，執行核准/退回，回結果。
- myOPS `POST /api/bot/query`：body {email, command}，回「我的待簽 / 剩餘假期 / 本月薪資」等。

---

## 四、Teams 卡片簽核 vs MFA —— 可設定的混合制（已定案 2026-06-14）

myOPS 現行規範：**所有簽核需通過 AAL2（MFA）**。Teams 卡片按鈕無法跑 MFA。定案做法：**預設走深連結（保留 MFA），但由 myOPS 後台讓管理員逐功能開放「一鍵直簽」，金額型單據可設門檻。**

### 政策模型（存於 myOPS `system_settings`，admin 設定頁可調）
```
bot_approval_policy = {
  <docType>: {
    one_tap: boolean,            // 是否允許 Teams 一鍵直簽（預設 false → 深連結）
    amount_threshold?: number,   // 金額型單據：金額 < 門檻才允許一鍵，否則深連結
  }
}
```
- 預設全部 `one_tap=false`（= 全走深連結 = 方案 A，最安全的起點）。
- 管理員在 myOPS 後台逐項打開低風險功能（如請假、小額採購）的一鍵；金額型（採購單、請款、薪資）填 `amount_threshold`。

### 執行流程
1. **發卡時**（myOPS → Dr.Ave /api/notify）：myOPS 依 `bot_approval_policy` + 該單金額決定送出的卡片是
   - **一鍵卡**（含 approve/reject 按鈕，action payload 帶 docType/docId/stepNo），或
   - **深連結卡**（按鈕 = 開 `https://ops.cancerfree.io/<doc>/<id>` 前往簽核）。
2. **點按鈕時**（Teams → Dr.Ave invoke → myOPS /api/bot/approve）：myOPS 端**再次驗證**該 docType 當下確實允許一鍵且金額未超門檻（防止政策變更後舊卡片繞過），重用 approval-engine `canActOnStep`（以點擊者 email 對 users 查身分），通過才執行；否則回覆「請前往網頁簽核」。
3. 一鍵直簽的單據在 audit_logs 標記 `via=teams_one_tap`（稽核可辨識未經 MFA 的簽核）。

> 安全備註：一鍵路徑的身分保證來自 Teams 頻道驗證（aadObjectId/email），非 MFA。門檻與逐功能開關讓管理員自行承擔風險範圍。

---

## 五、Task 清單

**Dr.Ave 端**
- T1 專案初始化（Next.js / 獨立 Supabase / Vercel / bot.cancerfree.io / env）
- T2 migration：conversation_references + registered_systems + card_actions
- T3 lib/teams-bot：getBotToken（快取）、sendProactiveMessage（文字）、sendCard（②）
- T4 /api/teams/bot：JWT 驗證 + conversationUpdate + message(③路由) + invoke(②回呼)
- T5 /api/notify：API key 驗證 + 文字/卡片外送
- T6 路由層：registered_systems 查詢 + 帶 bot_token 回呼來源系統 + 卡片狀態更新
- T7 Azure Bot Messaging Endpoint 改指 bot.cancerfree.io（myCRM 互動 bot 隨之停用）

**myOPS 端（改接 Gateway）**
- T8 移除 src/lib/teams-bot.ts 直打 Bot Framework，改呼叫 Dr.Ave /api/notify
- T9 既有通知（請假/薪資/公告/打卡/摘要/採購簽核）改送 card（②）或 text；依 `bot_approval_policy` 決定一鍵卡 vs 深連結卡
- T9b admin 設定頁：`bot_approval_policy` 逐功能 one-tap 開關 + 金額門檻（三語）
- T10 新增 /api/bot/approve + /api/bot/query（bot-facing，BOT_GATEWAY_TOKEN 驗證，重用 approval-engine；approve 內再驗政策/門檻，audit 標記 via=teams_one_tap）與各查詢邏輯
- T11 conversation reference 不再由 myOPS 存（移除 teams_conversation_references 依賴，改由 Dr.Ave 集中）

**myCRM 端**
- T12（選配）任務通知改呼叫 Dr.Ave /api/notify；互動排會議本版不遷移（停用）

---

## 六、決策待確認

1. **第四節 MFA 取捨**：A / B / C？（最關鍵）
2. **Repo**：新建 github.com/cancerfreebiotech/dr-ave？本機 /home/po/proj/dr-ave？
3. **Supabase**：新建獨立 Dr.Ave 專案（我的 MCP 可在 org uwmykvffywizbxgkgkpk 建）？
4. **網域**：bot.cancerfree.io（需 DNS + Vercel domain）？
5. **myOPS conversation reference migration**：已匯入的歷史/現有 ref（目前 myOPS 表內可能尚無，因 Azure 未設定）→ 多半從零開始，員工重新私訊 bot 即可。

---

*v0.2-draft | 2026-06-14 | 接續 v0.1（2026-04-07）*
