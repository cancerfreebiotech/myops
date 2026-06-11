# Teams Bot 設定指南（T63）

本文件說明如何在 Azure 建立 myOPS Teams Bot、把它安裝到 Microsoft Teams，並完成 Vercel 環境變數設定。完成後，系統即可透過 Bot 主動推送通知（請假審核結果、薪資單、公告、打卡提醒、每日待辦摘要）。

> **Messaging Endpoint：** `https://ops.cancerfree.io/api/teams/bot`

---

## 一、建立 Azure App Registration

1. 登入 [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. 設定：
   - **Name：** `myOPS Teams Bot`
   - **Supported account types：** 選 **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)**（Bot Framework 要求 multi-tenant）
   - **Redirect URI：** 留空
3. 建立後，記下 **Application (client) ID** → 這就是 `TEAMS_BOT_APP_ID`
4. 左側 **Certificates & secrets** → **New client secret**：
   - Description：`myops-bot`，效期建議 24 個月
   - 建立後**立刻複製 Value**（離開頁面後無法再看）→ 這就是 `TEAMS_BOT_APP_SECRET`

> 注意：到期前需要換發 secret 並更新 Vercel 環境變數，建議設行事曆提醒。

---

## 二、建立 Azure Bot Service

1. Azure Portal → **Create a resource** → 搜尋 **Azure Bot** → **Create**
2. 設定：
   - **Bot handle：** `myops-bot`（全域唯一，僅內部識別用）
   - **Subscription / Resource group：** 依公司現有資源群組
   - **Pricing tier：** F0（免費，足夠內部通知用）
   - **Type of App：** **Multi Tenant**
   - **App ID：** 選 **Use existing app registration**，填入步驟一的 `TEAMS_BOT_APP_ID`
3. 建立完成後，進入 Bot 資源 → **Settings → Configuration**：
   - **Messaging endpoint：** `https://ops.cancerfree.io/api/teams/bot`
4. **Settings → Channels** → 點 **Microsoft Teams** → 同意條款 → 選 **Microsoft Teams Commercial** → **Apply**

---

## 三、安裝到 Microsoft Teams

### 方法 A：上傳 App Manifest（建議）

1. 準備 manifest 套件（zip，內含 `manifest.json` + `color.png` 192x192 + `outline.png` 32x32）。`manifest.json` 重點欄位：

   ```json
   {
     "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.16/MicrosoftTeams.schema.json",
     "manifestVersion": "1.16",
     "version": "1.0.0",
     "id": "<TEAMS_BOT_APP_ID>",
     "name": { "short": "myOPS", "full": "myOPS 通知小幫手" },
     "description": {
       "short": "myOPS 系統通知",
       "full": "推送請假審核結果、薪資單、公告與打卡提醒"
     },
     "developer": {
       "name": "CancerFree",
       "websiteUrl": "https://ops.cancerfree.io",
       "privacyUrl": "https://ops.cancerfree.io",
       "termsOfUseUrl": "https://ops.cancerfree.io"
     },
     "icons": { "color": "color.png", "outline": "outline.png" },
     "accentColor": "#FFFFFF",
     "bots": [
       {
         "botId": "<TEAMS_BOT_APP_ID>",
         "scopes": ["personal", "team"],
         "supportsFiles": false,
         "isNotificationOnly": false
       }
     ],
     "permissions": ["identity", "messageTeamMembers"],
     "validDomains": ["ops.cancerfree.io"]
   }
   ```

2. [Teams Admin Center](https://admin.teams.microsoft.com) → **Teams apps → Manage apps** → **Upload new app** → 上傳 zip
3. 上傳後在 Manage apps 把 App 狀態設為 **Allowed**，並可透過 **Setup policies** 預先幫全員安裝（建議，可省去員工手動安裝）

### 方法 B：開發測試用（自行上傳）

Teams 用戶端 → **Apps → Manage your apps → Upload an app → Upload a custom app** → 選 zip（需 org 允許 custom app upload）。

---

## 四、Vercel 環境變數

在 Vercel 專案 → **Settings → Environment Variables**（Production + Preview）設定：

| 變數 | 值 |
|------|-----|
| `TEAMS_BOT_APP_ID` | 步驟一的 Application (client) ID |
| `TEAMS_BOT_APP_SECRET` | 步驟一的 Client Secret Value |
| `AZURE_TENANT_ID` | 公司 Entra ID 的 Tenant ID（Entra ID → Overview） |
| `CRON_SECRET` | 隨機字串，供 Vercel Cron 呼叫 digest / reminder 用 |

設定完成後 **Redeploy** 使變數生效。

---

## 五、Conversation Reference 的建立機制（重要）

Bot **無法**主動傳訊給從未互動過的使用者。系統需要先取得每位使用者的 conversation reference（存在 `teams_conversation_references` 表，每人一筆），取得方式有二：

1. **員工私訊 Bot 一次**：員工在 Teams 搜尋「myOPS」並傳任意訊息（例如「hi」）。Bot 會回覆說明文字，同時後端把 conversation reference 寫入 DB。
2. **Bot 被安裝 / 加入**：透過 Setup policy 全員預裝，或把 Bot 加入團隊時，Teams 會送 `conversationUpdate` 事件，後端會以成員的 email（`userPrincipalName`）比對 `users.email`（不分大小寫）後寫入。

> Email 比對不到 myOPS 使用者時只會記 log、不報錯。員工到職後若收不到通知，請先確認其 Teams 帳號 email 與 myOPS 一致，再請他私訊 Bot 一次。

---

## 六、驗證

1. 在 Teams 私訊 Bot「hi」→ 應收到中英日三語說明回覆
2. 查 Supabase `teams_conversation_references` 表 → 應有該員工的紀錄
3. 手動觸發測試（admin 身分或帶 `CRON_SECRET`）：

   ```bash
   curl -X POST https://ops.cancerfree.io/api/teams/notify \
     -H "Authorization: Bearer $CRON_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"user_id":"<uuid>","message":"測試訊息","type":"announcement"}'
   ```

4. 員工 Teams 應收到該訊息

---

## 疑難排解

| 症狀 | 可能原因 |
|------|---------|
| Teams 傳訊 Bot 沒回應 | Messaging endpoint 打錯、Vercel 未部署、JWT 驗證失敗（`TEAMS_BOT_APP_ID` 不一致） |
| Webhook 回 401 | 請求非來自 Bot Framework，或 App ID 與 manifest / Bot Service 不一致 |
| 收不到主動通知 | DB 沒有該員工的 conversation reference（請先私訊 Bot 一次）|
| Token 取得失敗 | `TEAMS_BOT_APP_SECRET` 過期或貼錯 |
