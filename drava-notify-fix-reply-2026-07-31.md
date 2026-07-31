# Dr.Ave → myOPS：notify not-ok 問題已定位並修復（2026-07-31）

> 回覆 `docs/DRAVE-NOTIFY-ISSUE.md`。結論先講：**是 Dr.Ave 端的 bug，你們完全照契約走，什麼都不用改。**修復已部署（FlightPath v4.8.1+）。

## 根因

Dr.Ave 的 `/api/notify` 收到你們契約形狀的 `card: { title, body, actions:[{label, action_type, payload, style?}] }` 之後，**原樣**塞進 Bot Framework activity 的
`application/vnd.microsoft.card.adaptive` attachment——那不是合法的 Adaptive Card JSON（缺 `type:"AdaptiveCard"`、`version`、`body[]`、`Action.Submit`），Bot Framework 拒收，Dr.Ave 端把送出失敗回成 `{ok:false}`（而且 method 還誤標 `"skipped"`，這個也一起修了）。

PRD §4.1 定的契約本來就是「來源系統送抽象描述、Dr.Ave 負責渲染」——渲染層漏做了，而 Dr.Ave 自己的確認卡片走另一條路（自組合法 AC），所以一直沒人發現。

## 回答你們的五個問題

1. **回的是什麼？** 合法 JSON `{ok:false, method:"skipped"}`（HTTP 200）。不是空 body 也不是 HTML。`method:"skipped"` 是誤標，修復後失敗回 `method:"failed"`。
2. **拒絕原因？** 上游 Bot Framework 拒收非法卡片（card schema 問題），不是找不到使用者、不是 token 過期、不是 source 未授權、不是 rate limit。
3. **這三人跟其他人差在哪？** 沒有差。三位在 Dr.Ave 側都有 conversation reference（找得到人）。真相是：**所有走 card 的通知從來沒有送達過任何人**——Dr.Ave 側 15 列 `card_actions`（7/29 起，時間戳與你們的錯誤 log 一一對上）全部 `pending`、零點擊。三位只是這段期間唯一的簽核通知收件人。
4. **是。只有 card 失敗，純 message 正常**（文字走同一條送出路徑但不含卡片渲染，Dr.Ave 的提醒/通知一直是通的）。
5. 時間點對照完成——你們每筆錯誤 log 都對到 Dr.Ave 側一列同秒建立的 `card_actions`（例如 7/31 08:09:04 兩邊都有）。

## 修了什麼（Dr.Ave 端）

1. `/api/notify` 現在把契約描述渲染成真正的 Adaptive Card（title→TextBlock Bolder、body→TextBlock、actions→`Action.Submit`，`style: positive/destructive` 對應 AC action style）。
2. **每個按鈕各建一列 `card_actions`**——順手修掉兩個你們還沒撞到的 bug：
   - 舊碼讀 `actionType`/`data`（camelCase），你們照契約送 `action_type`/`payload`（snake_case），所以舊的 15 列全記成 `action_type:"submit"`、payload 空——就算卡片當時送達、按下核准，轉發給你們的也會是空 payload。
   - 舊碼只給整張卡建一列：核准與退回會共用同一個 action。現在各自一列，點哪顆按鈕就轉發哪顆的 `action_type`+`payload`。
3. 失敗回 `{ok:false, method:"failed"}`；`"skipped"` 從此專指「查無 conversation reference」。

## 點擊回呼的格式（提醒確認）

按鈕按下後 Dr.Ave 會 POST 你們的 `/api/bot/approve`（Bearer 你們的 bot_token）：

```json
{ "actionType": "<你們送來的 action_type>", "payload": <你們送來的 payload>, "actor": { "email": "點擊者", "name": "..." } }
```

注意這裡是 `actionType`（camelCase，Dr.Ave 轉發層既有格式）＋原樣 payload。若你們的 `/api/bot/approve` 是照 PRD §4.3 的 `{email, docType, docId, stepNo, action}` 實作的，請把簽核所需的欄位放進 `payload` 裡（你們發卡時的 payload 會原封不動回來）。**卡片送達後請實測一次點擊**，格式對不上就回報，我們再對齊。

## 你們要做的事

- 程式：**不用改**。下一張簽核卡發出時就會送達。
- 幫忙確認兩件事：
  1. 有單進來時，簽核人真的在 Teams 收到卡片（樣式：粗體標題＋內文＋按鈕）。
  2. 點「核准/退回」後你們的 `/api/bot/approve` 收到的格式如上；點擊者會在 Teams 看到結果回覆。
- 已知個案：`justin.lee@cancerfree.io` **封鎖了 Dr.Ave**（Bot Framework 403 ConversationBlockedByUser，7/25–7/27 三次實錄）。他若是簽核人，通知會回 `ok:false`＋你們新 log 會看到 `method:"failed"`——這不是系統問題，要請他在 Teams 解除封鎖 Dr.Ave。

## 舊資料處理

7/29–7/31 的 15 列 pending `card_actions` 是從未送達的死卡，Dr.Ave 端不會重送（通知的重送策略在呼叫端）。那三筆簽核如果還卡著，請在 myOPS 端重觸發通知或請簽核人直接進 `ops.cancerfree.io` 簽。
