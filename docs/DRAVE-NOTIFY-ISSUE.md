# Dr.Ave `/api/notify` 對三位收件人一直回 not-ok — 給 Dr.Ave 那邊的問題單

**回報者**：myOPS（`ops.cancerfree.io`，Vercel 專案 `myops`）
**日期**：2026-07-31
**影響**：採購簽核通知送不到簽核人，簽核人不知道有單要簽（會以為系統沒反應）。
myOPS 端不會因此失敗——`postNotify` 永不 throw，通知失敗只記 log、簽核本身照常完成。
所以這是**靜默**的：使用者只會覺得「沒收到通知」。

---

## 症狀

Vercel runtime errors（`myops`，過去 36 小時彙整）只有這一類，三組，各 count=1：

| 收件人 | 路由 | first seen | last seen |
|---|---|---|---|
| `eva.hung@cancerfree.io` | `/api/procurement/approvals/[docType]/[id]` | 2026-07-30T07:54:34Z | 2026-07-30T07:54:34Z |
| `scott.lok@cancerfree.io` | `/api/procurement/approvals/[docType]/[id]` | 2026-07-29T01:24:48Z | **2026-07-31T08:09:04Z** |
| `alex.lien@cancerfree.io` | `/api/procurement/approvals/[docType]/[id]` | 2026-07-29T00:12:48Z | **2026-07-31T06:38:27Z** |

log 內容（`src/lib/teams-bot.ts`）：

```
[teams-bot] Dr.Ave notify returned not-ok for <email>
```

跨了三天、最後一次是 7/31，所以不是一次性的。

## 這**不是**「使用者沒註冊過 DrAva」

myOPS 端對三種結果的處理是分開的，這點很重要：

```ts
if (!res.ok)                     → console.error('... notify failed for X (status): body')   // HTTP 非 2xx
if (!data?.ok)                   → console.error('... notify returned not-ok for X')         // ← 我們看到的是這個
if (data.method === 'skipped')   → console.log('... skipped X (no conversation reference)')  // 不算錯誤
```

`method === 'skipped'`（沒有 conversation reference）走的是 `console.log`、**不會**出現在
runtime errors。我們看到的是 `data.ok` 不為 true 的分支，也就是 **Dr.Ave 回了 2xx，
但 body 的 `ok` 不是 true**。

⚠️ 一個已知的模糊點（myOPS 端 2026-07-31 已修，但修正版尚未部署到出現上述 log 的版本）：
舊版程式碼是 `await res.json().catch(() => null)`，所以**「Dr.Ave 明確回 `{ok:false}`」
與「回了非 JSON／空 body」會印出同一句話**。現在已改成把 HTTP status 與 body 前 300 字
一起記下來，下一次發生就能直接分辨。上面那三筆是舊版留下的，只能確定「不是 skipped」。

## myOPS 端送出的內容（合約）

```
POST https://drava.cancerfree.io/api/notify
Authorization: Bearer <DRAVA_NOTIFY_API_KEY>
Content-Type: application/json

{ "to": "<email>", "source": "myops", "message"?: "<text>", "card"?: { title, body, actions[] } }
```

myOPS 期待的回應：

```json
{ "ok": true, "method": "teams" }      // 已送達
{ "ok": true, "method": "skipped" }    // 對方沒有 conversation reference，正常降級
```

`card.actions[]` 的形狀：`{ label, action_type, payload, style? }`。
採購簽核的通知是走 card（有「核准／退回」按鈕），不是純文字 message。

收件人是**用 email 認人**，不是 myOPS 的 user_id（myOPS 內部先把 userId 轉成
`users.email` 才送出）。三個 email 都是 `@cancerfree.io` 的在職使用者。

## 想請 Dr.Ave 那邊查的

1. `/api/notify` 對這三個 email 回的到底是什麼？`{ok:false}` 加什麼原因，
   還是 2xx 但 body 不是 JSON（例如空 body、HTML 錯誤頁、或 redirect 後的內容）？
2. 如果是 `ok:false`：拒絕原因是什麼？（找不到 Teams 使用者／Azure bot token 過期／
   card schema 驗證失敗／`source: 'myops'` 未授權／rate limit？）
3. 這三個人與其他 5 位同事在 Dr.Ave 側的狀態差在哪？
   （`method: 'skipped'` 才是「沒註冊」，而我們拿到的不是 skipped——所以他們在
   Dr.Ave 側應該是「找得到、但送出失敗」。）
4. 是否只有 `card` 形式失敗、純 `message` 正常？採購簽核只用 card，這會決定是不是
   card schema 的問題。
5. Dr.Ave 側有沒有對應時間點（7/29 00:12Z、7/29 01:24Z、7/30 07:54Z、7/31 06:38Z、
   7/31 08:09Z）的 log 可以對照？

## 補充資訊

- myOPS 有一張 `teams_conversation_references` 表，8 位使用者全部 0 筆——但那是自架
  Bot Framework 時期的遺留，`src/` 完全沒有引用它（`grep` 無結果），**與本問題無關**，
  不要拿它當「沒註冊」的證據。conversation reference 現在完全由 Dr.Ave 自己持有。
- 送信（release note / feedback 彙整）走的是另一條路：
  `POST https://drava.cancerfree.io/api/systems/send-email`，那條目前正常。
  失敗的只有 `/api/notify`（Teams 推播）。
- 相關程式碼：`src/lib/teams-bot.ts`（`postNotify`）、
  呼叫端 `src/app/api/procurement/approvals/[docType]/[id]/route.ts`。
