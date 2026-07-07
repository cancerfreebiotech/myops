# myOPS 開發 Handover

> 交接文件，供接手的 session 快速進入狀況。最後更新：2026-07-04，v0.6.0。

## 一句話現況

兩天內完成 Roadmap 的 **11 個新模組**（v0.5.1–v0.6.0）全部上線，但**所有新模組的 feature flag 都還關著、104 項 UAT 一項都沒跑**。接手後最該做的是**實測而非續堆功能**（見文末建議）。

---

## 專案基本資訊

- **Repo**：`cancerfreebiotech/myops`，master 分支，工作目錄 `/home/po/proj/myops`
- **正式網域**：`ops.cancerfree.io`（不是 myops.cancerfree.io）
- **技術棧**：Next.js 16 App Router、TypeScript、Tailwind v4、Supabase（PostgreSQL + RLS）、next-intl（zh-TW/en/ja）、Vercel 部署、Microsoft AAD OAuth + MFA
- **Supabase 專案 ref**：`odzwvkhdrahomgqwlwba`
- **目前版本**：v0.6.0

## 關鍵開發慣例（務必遵守）

1. **UI 規範**：實作任何頁面/元件前先讀 `design-system/myops/MASTER.md`（例：禁用 emoji 當圖示，用 lucide-react）。
2. **權限雙層**：`feature flag`（模組總開關，存 `system_settings.feature.*`，`src/lib/feature-flag-keys.ts` 的 `FEATURE_KEYS`）＋ `granted_features`（使用者細權限，`src/lib/features.ts` 的 `FEATURE_KEYS`，admin 在 `/admin/users` 指派）。新模組頁面一律 `canAccessFeature(role, flags, '<key>')` 不過就 `redirect('/no-permission')`。
3. **⚠️ createServiceClient 陷阱**（`src/lib/supabase/server.ts`）：它帶 request cookies，**實際以使用者身分跑 RLS**（不是真 service role）。全站 300+ 呼叫點都依此行為。**不可改成無 cookies 的真 service client**，否則所有依賴 RLS 的 route 立刻繞過 RLS。需要真繞過時另建 client 並在 route 補明確授權。
4. **審批動作需 MFA**：leave/overtime/makeup/expense/business_trip 的核准動作都檢查 `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` === 'aal2'，否則回 403 `code: 'MFA_REQUIRED'`。
5. **日期用 Asia/Taipei**：`src/lib/taipei-date.ts` 的 `taipeiToday()` / `isValidDateString()`；API 端日期參數用 `isValidDateString` 驗證。
6. **交付循環**（每個模組）：寫 migration + API（安全關鍵，主 session 自己寫）→ workflow/agent 分派 UI 與 i18n/wiring/UAT → `npm run lint` / `npx tsc --noEmit` / `npm run build` 全綠 → 用 Management API 跑 migration（見下）→ commit/push → CI 自動 bump 版本 → 補 CHANGELOG 用 `[skip ci]`。
7. **CI 自動 bump**：每次 feat/fix push 後 GitHub Actions 會自動 bump patch 版本並 `[skip ci]` 推回；patch 滿 9 進位 minor。補 CHANGELOG 前先 `git stash -u && git pull --rebase && git stash pop`。
8. **跑 migration 的方式**（直連 DB 的 pooler 不通，用 Management API）：腳本在 `/tmp/claude-*/…/scratchpad/run-mig-api.mjs`，讀 `.env.local` 的 `SUPABASE_ACCESS_TOKEN`，POST 到 `https://api.supabase.com/v1/projects/odzwvkhdrahomgqwlwba/database/query`。若 scratchpad 清了就照這個模式重建：讀 token → POST { query: <SQL 檔內容> }。
9. **憑證**：一律從 `.env.local` 或 `~/.claude/notify-release.env` 讀，**絕不 inline 在 bash 指令**（Luna 明確要求過）。
10. **notify release**：`/notify-release` skill 或手寫 node script 打 SendGrid（憑證 `~/.claude/notify-release.env`）。收件人 = active users（linda, jessie, pohan, eva, shihpei）。發布前確認 CHANGELOG 有對應版本。

## 2026-07-05/06 全站稽核 — 已修 vs 待修

**已修並上線**（migration `20260705000001` / `20260705000002` 已跑線上並驗證；程式已 push）：
- leave_types 嵌入用不存在的 `name`/`pay_rate` 欄位（全 8 處改 PostgREST 別名）— 影響線上請假/簽核/行事曆查詢
- 報帳、出差 UPDATE 補 `WITH CHECK`（原本本人取消必 500）
- **CRITICAL** users self-update 可自設 `role='admin'` → guard trigger 擋敏感欄位
- 請假、加班自我核准 → RLS `WITH CHECK` + route 核准人身分檢查
- 文件核准補 MFA aal2 + status 變更 guard trigger（原上傳者可自審）
- 履歷 `recruiting-files` storage RLS 收緊為 admin/hr_manager（原全員可下載）
- 試劑批次改原子 RPC `lab_lot_apply`（lost update／discarded 可操作／超領靜默截斷）
- insights 近 6 月視窗改台北時區運算
- expenses POST 驗證 trip_id 屬本人且已核准
- 訓練時數禁非管理者竄改、證照不得復活軟刪除、資產軟刪除限 admin

**第二/三批已修並上線**（migration `20260706000001` 已跑線上驗證；v0.6.3）：
- ✅ 請假/加班「送出」修復（欄位對齊 schema；⚠️ **仍需以真實登入帳號跑一次 UAT 送出→核准全流程**，目前僅以 rolled-back dry-run 驗證欄位集正確）
- ✅ 採購作廢限 canWrite + MFA；驗收單 PUT 補所有權檢查
- ✅ 薪資核准狀態機前置驗證 + 條件式寫入；status 補 'rejected'
- ✅ 補打卡核准人以 manager_id 判定、禁本人核准、trigger 強制 approver_id
- ✅ 試劑禁對已軟刪品項入庫；打卡/提醒/到期 cutoff 改台北時區；證照 PATCH 日期驗證

**行事曆 RLS 欄位洩漏已修**（migration `20260706000002`，v0.6.4）：移除過寬 row policy，改以 3 個 SECURITY DEFINER function 只回安全欄位（公司行事曆全員；請假行事曆 HR/admin 全部、一般員工限同部門）。

**稽核全部修復完成。** 唯一仍待人工確認：請假/加班「送出→核准」全流程需以真實登入帳號跑一次 UAT（目前僅 rolled-back dry-run 驗證欄位集）。

## 已知技術債（可順手修，非緊急）

- `attendance_makeup_requests` 的審批已補（v0.5.2 的 `approve_makeup_request` SECURITY DEFINER function）。
- Luna 並無未處理的問題回報（先前誤會，已澄清）。

---

## 已完成模組（v0.5.1–v0.6.0，11 個）

| 版本 | 模組 | 路由 | flag | granted feature |
|------|------|------|------|-----------------|
| 0.5.1 | 員工報帳 | `/expenses` | `expenses` | `expense_approve` |
| 0.5.2 | 統一簽核中心 | `/approvals` | `approvals` | — |
| 0.5.3 | 資產與儀器 | `/assets` | `assets` | `asset_manage` |
| 0.5.4 | 教育訓練與證照 | `/training` | `training` | `training_manage` |
| 0.5.5 | 出差管理 | `/business-trips` | `business_trip` | — (主管/hr_manager 審批) |
| 0.5.6 | 公司行事曆 | `/calendar` | `calendar` | — (hr_manager 管理活動) |
| 0.5.7 | 營運儀表板 | `/insights` | `insights` | — (admin 限定) |
| 0.5.8 | AI 政策問答 | `/help` 內嵌 + Teams bot | `ask_ai` | — (用 Gemini) |
| 0.5.9 | 入職/離職流程 | `/admin/lifecycle` | `lifecycle` | — (hr_manager) |
| 0.6.0 | 招募管理 | `/admin/recruiting` | `recruiting` | — (hr_manager) |
| 0.6.0 | 試劑/耗材 | `/lab` | `lab_supplies` | `lab_manage` |

**所有 11 個 flag 目前都是 `false`**（DB 已確認）。既有模組 flag 為 true 的：attendance, leave, overtime, payroll, documents, announcements, contracts, projects, feedback, procurement, daily_report。

同期修的兩件事：v0.5.2 補文件 PATCH 授權漏洞 + 補打卡審批 endpoint；v0.5.3 對齊薪資權限 key（`view_payroll`/`confirm_payroll`/`approve_payroll` 進 grantable 清單，移除 9 個從未被檢查的死 key）。

migrations：`20260703000001`–`20260703000008`、`20260704000001`–`20260704000003`，**全部已跑線上 DB 並驗證 RLS**。

---

## 接下來的 Roadmap（`docs/ROADMAP.md` 為準）

> **2026-07-07 更新**：**整份 roadmap 已全數完成**（含原「未來再評估」項）—— #11 績效考核（v0.6.1）、GR 轉資產、B 類 7 項（v0.6.5）、Outlook 單向行事曆同步（v0.6.9）、OCR 全文搜尋＋彈性班別＋打卡 GPS 圍欄（v0.7.0）皆已上線。**目前 roadmap 無待做項目**；#13 服務台 Luna 決定不做。新需求另議。
> OCR 需 admin 在 /admin/settings 設定 `ocr_api_url`(+key) 指向 OCR/Vision 服務；地理圍欄 `geofence_enforce` 預設關閉。

### 尚未做的功能

| # | 功能 | 狀態 / 觸發條件 |
|---|------|----------------|
| — | ~~行事曆 Outlook 同步~~ | ✅ 完成（v0.6.9，單向、per-user OAuth、核准後自動推送）|
| 13 | **IT/總務服務台** | ❌ 不做（Luna 決定）|

### AI 問答的已知限制（若要強化 #8）

- 目前是 v1：無向量檢索，直接把 documents 的 `content_*` 欄位全文塞進 Gemini prompt（有 60000 字上限截斷）。
- 只吃有 `content_zh/en/ja` 欄位的已發布 REG/ANN/INTERNAL 文件；**純 PDF（只有 file_url、無文字欄位）的文件不會被讀到** — 沒有 PDF 解析。
- 若要升級：加 pgvector + embedding pipeline，或加 PDF 文字抽取。

### 延後的項目（有記在 roadmap）

- 資產：採購驗收單（GR）一鍵轉資產（schema 已留 `source_gr_id` 欄位，UI 未做）
- 行事曆：Outlook/Teams 日曆雙向同步
- 營運儀表板：薪資成本圖

---

## 已決策（2026-07-04）

1. **#11 績效考核：已完成**（v0.6.1，2026-07-05；migration 20260704000004 已跑線上並驗證 RLS，flag 預設關閉）。
2. **#13 IT/總務服務台：不做**。
3. **PM 舊站歷史資料：不遷移**，每日報告從零開始使用。
4. 其餘延後項目列入 `docs/ROADMAP.md` 的 TODO backlog。

## Release note

v0.5.1–v0.6.0 的 release note 皆已寄出（v0.5.9/v0.6.0 於 2026-07-04 補寄）。之後發版用 `/notify-release`。

## 給接手 session 的第一步建議

1. 讀 `docs/ROADMAP.md`、`CHANGELOG.md`、本檔。
2. **先問 Luna：要繼續開發（#11/#13）還是進入 UAT？** 目前 11 個模組零實測，繼續堆功能的邊際價值低。
3. 若進 UAT：協助 admin 在 `/admin/settings` 開 flag、在 `/admin/users` 指派 granted features、把 `docs/UAT-checklist.md`（104 項）的測試員分配表填好發出。
4. 若續開發：沿用上述交付循環；subagent 常撞 session 額度上限（reset 時間浮動），撞到時檔案通常已寫完，主 session 接手驗證即可。
