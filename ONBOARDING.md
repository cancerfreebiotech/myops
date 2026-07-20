# myOPS 交接指南（ONBOARDING）

> 給接手的 Claude Code session／新機器。最後更新：**2026-07-20**，版本 **v0.8.5**。
> 舊版交接文 `docs/HANDOVER.md`（2026-07-04, v0.6.0）僅作歷史參考，現況以本檔為準。

## 一句話現況

系統已全功能上線（roadmap Tier 1–3 全完成、UAT v2.5 共 169 項、v0.8.5 於 2026-07-11 部署），但 **2026-07-20 例行日誌掃描發現一批未修的線上 bug（見「立即要處理」），其中採購單建立對所有人都是壞的**。另有 2 件產品決策在等 Luna 拍板。

---

## 專案基本資訊

- **這是什麼**：精拓生技（CancerFree Biotech）內部 HR／營運系統 myOPS——出勤、請假、加班、薪資、文件簽核、公告、採購、資產、訓練、報帳、出差、招募、AI 政策問答等。
- **Repo**：`github.com/cancerfreebiotech/myops`，master 分支直推（無 PR 流程）。
- **正式網域**：`ops.cancerfree.io`（**不是** myops.cancerfree.io——CLAUDE.md 有明文）。
- **技術棧**：Next.js 16 App Router + TypeScript + Tailwind v4 + next-intl（zh-TW/en/ja）；Supabase（Postgres + RLS）；Vercel 部署（functions region `hnd1`，與 DB 同區）；Microsoft AAD OAuth + MFA。
- **Supabase**：project ref `odzwvkhdrahomgqwlwba`（ap-northeast-1 東京）。
- **Vercel**：project `myops`（`prj_bQPnRU1dR2s8aCqg3hl8deBtmBqh`，team `team_2ROdEsQOs9WqAXrHwtIevCO9`）。
- **主要窗口**：Luna（Po-Han Chen，`pohan.chen@cancerfree.io`，admin）。線上約 8 位 active users。

## 新機器環境設定 checklist

1. `gh auth login` 後 clone repo 到工作目錄。
2. **`.env.local`**（不在 repo）：從舊機器複製，或 `vercel link` + `vercel env pull`。⚠️ 正式環境變數**以 Vercel 為準**（曾發生本機與 Vercel 漂移、anon key 失效導致全員登入失敗）；改 `NEXT_PUBLIC_*` 後必須重新部署才生效。
3. **`~/.claude/notify-release.env`**（SendGrid 憑證，chmod 600）：從舊機器複製，否則 `/notify-release` 與 UAT 寄信都不能用。
4. `vercel link`（選 team `team_2ROdEsQOs9WqAXrHwtIevCO9` / project `myops`）。
5. `npm install && npm run build` 確認綠燈。
6. 讀：`CLAUDE.md` → `design-system/myops/MASTER.md`（**做任何 UI 前必讀**）→ `docs/ROADMAP.md` → `docs/CHANGELOG.md` → 本檔。

---

## 🔥 立即要處理（2026-07-20 日誌掃描發現，均未修）

> 背景：這些查詢錯誤長期被 `?? []` 吞掉、頁面靜默顯示空清單，所以 UAT 沒抓到。7/20 上午 Linda Chao（admin）實際撞到多次。修好後建議順手處理「錯誤被吞」的模式（至少 console.error）。

### P0 — 採購單（PR）建立對所有人都失敗

- **症狀**：新增採購單 → 500/403，`new row violates row-level security policy for table "doc_counters"`。7/20 Linda 試了 2 次都失敗。`doc_counters` 表是**空的** ⇒ 自 6/12 上線以來，App 內從未成功建立過任何需要自動編號的採購文件（先前資料都是 Ragic 匯入、自帶 doc_no 繞過了 trigger）。
- **根因**：`supabase/migrations/20260612000009_procurement_core.sql` 的 `next_doc_no()` **不是 SECURITY DEFINER**，而 `doc_counters` 開了 RLS 但只有 SELECT policy ⇒ BEFORE INSERT trigger `set_procurement_doc_no` 以呼叫者身分 INSERT `doc_counters` 必被 RLS 擋（admin 也一樣，因為根本沒有寫入 policy）。
- **修法**（一支 migration，**跑線上前需 Luna 明確授權**）：
  ```sql
  ALTER FUNCTION next_doc_no(text, text) SECURITY DEFINER SET search_path = public;
  ```
  （比補 INSERT/UPDATE policy 乾淨；務必釘 `search_path`，見下方「教訓」。）修完實測建一張 PR 確認拿到 `PR-YYMM-001` 編號。

### P1 — 14 個頁面對 `users` 過濾不存在的 `deleted_at` → 400 → 清單空白

`public.users` **沒有** `deleted_at` 欄位（活躍與否用 `is_active`）。以下檔案的 users 查詢鏈帶了 `.is('deleted_at', null)`，整條查詢 400、頁面靜默顯示空資料（例：出勤管理的全員清單、請假頁的代理人下拉、專案成員選單）：

```
src/app/(dashboard)/admin/attendance/page.tsx      src/app/(dashboard)/admin/companies/page.tsx
src/app/(dashboard)/admin/departments/page.tsx     src/app/(dashboard)/admin/hr-settings/page.tsx
src/app/(dashboard)/admin/leave-balances/page.tsx  src/app/(dashboard)/attendance/page.tsx
src/app/(dashboard)/documents/[id]/page.tsx        src/app/(dashboard)/documents/page.tsx
src/app/(dashboard)/leave/page.tsx                 src/app/(dashboard)/payroll/annual/page.tsx
src/app/(dashboard)/payroll/page.tsx               src/app/(dashboard)/procurement/purchase-requests/[id]/page.tsx
src/app/(dashboard)/projects/[id]/page.tsx         src/app/(dashboard)/projects/page.tsx
```

- **修法**：把 users 查詢鏈上的 `.is('deleted_at', null)` 移除（`is_active=true` 已足夠）。上表是「`from('users')` 附近 12 行內出現 deleted_at」的掃描結果——動手前逐檔確認該 filter 確實掛在 users 的查詢鏈上（有些檔案同時查 documents/assets 等**有** deleted_at 的表，那些要保留）。
- 全庫有 `deleted_at` 的表（供對照）：assets, certifications, companies, company_events, daily_report_groups, departments, documents, job_openings, lab_supplies, products, projects, training_courses, vendor_products, vendors, warehouses, work_shifts。**users、document_recipients 沒有。**

### P1 — 4 處對 `document_recipients` select 不存在的 `id` → 400 → 公告清單空白

`document_recipients` 是複合主鍵 `(document_id, user_id)`，**從第一天就沒有 `id` 欄位**：

- `src/app/(dashboard)/page.tsx:90` — **首頁「待確認公告」區塊因此永遠空白**（使用者可見影響最大）
- `src/app/(dashboard)/announcements/[id]/page.tsx:49`
- `src/app/api/announcements/my-pending/route.ts:12`
- `src/app/api/export/announcement-reads/route.ts`（backtick select 內）

**修法**：select 改 `document_id, user_id, ...`，下游用到 `row.id` 的地方（React key、confirm 呼叫等）改用 `document_id`（或複合 key）。

### P2 — 請假頁代理人查詢：部門為空時送出 `department_id=eq.`（空字串）→ 400

`src/app/(dashboard)/leave/page.tsx:52-59`：`.eq('department_id', currentUser?.department_id ?? '')`。使用者無部門時空字串仍下查詢。**修法**：無 `department_id` 就跳過查詢回空陣列；同檔的 `.is('deleted_at', null)` 也要一併移除（見 P1）。

### P3 — 補打卡「核准自己的申請」回 forbidden（by design，但 UX 差）

7/20 Linda 對**自己的**補打卡申請連按 5 次核准、每次都被 `approve_makeup_request` RPC 以 `forbidden` 拒絕——這是職責分離的預期行為（禁自我核准；核准人限 `users.manager_id` 或 admin，Linda 的單該由 Eva Hung 核）。**要修的是 UI**：簽核中心對「自己的申請」隱藏／停用核准鈕，錯誤訊息明確化（「不可核准自己的申請」）。

---

## 等 Luna 拍板的決策（已於 7/11 email 提醒過）

1. **GR→入庫防重**：一張驗收單（GR）可否開多張入庫單？線上已有 **15 筆**一 GR 多入庫的既有資料。若「一 GR 只能入庫一次」：先人工清理那 15 筆 → 把 `supabase/migrations/20260711000020_procurement_dedup_and_installment_no.sql` 內**註解掉的** `uq_inbound_orders_gr_active` 索引啟用 → 恢復 `src/lib/procurement/conversions.ts` 與 `src/app/api/procurement/inbound/route.ts` 的 app 層防重（7/11 已寫過後被撤，git history 可查）。
2. **月薪制國定假日加班倍率**：目前 2.00x；若 Luna 決定 1x，只要在 `/admin/overtime-rates` 把國定假日改 1.00，**不用改程式**。
3. （小項）`assets/[id]` 單筆 API 缺 feature flag 檢查——低影響，記在 ROADMAP。

## Feature flags 現況

- **關閉中（11 個）**：approvals, assets, business_trip, calendar, expenses, insights, lab_supplies, lifecycle, performance, recruiting, training。開關在 `/admin/settings`（存 `system_settings` 的 `feature.<key>`）。
- **慣例**：flag 由 Luna 決定何時開，**不要代開**；寄 UAT 給 admin 時要附「尚未開啟的 flag」提醒清單。

---

## 關鍵開發慣例（務必遵守）

1. **UI**：動手前先讀 `design-system/myops/MASTER.md`（禁 emoji 圖示，用 lucide-react）。
2. **權限雙層**：feature flag（模組開關）＋ `granted_features`（使用者細權限，`src/lib/features.ts`）。頁面用 `canAccessFeature(role, flags, key)`（admin 恆通過），不過就 `redirect('/no-permission')`。
3. **⚠️ `createServiceClient` 陷阱**（`src/lib/supabase/server.ts`）：帶 request cookies、**實際以使用者身分跑 RLS**（不是真 service role）。全站 300+ 呼叫點依賴此行為，**不可改成真 service client**。需要繞 RLS 用 `createAdminClient`（無 cookies、真 service role），且 route 內必須自己補授權檢查。
4. **審批動作需 MFA aal2**：leave/overtime/makeup/expense/business_trip/documents 的核准都檢查 `getAuthenticatorAssuranceLevel() === 'aal2'`，不足回 403 `MFA_REQUIRED`。`src/proxy.ts` middleware 也強制 MFA。
5. **日期一律 Asia/Taipei**：用 `src/lib/taipei-date.ts`（`taipeiToday()`、`isValidDateString()`）。
6. **i18n**：`messages/zh-TW.json`、`en.json`、`ja.json` 三檔 key 必須完全一致，缺 key 會 build fail 或 runtime 掉字。
7. **PostgREST 陷阱**：對嵌入資源過濾**必須** `!inner`，否則不會限縮父層（曾因此漏資料）；或改兩段式（先撈 id 清單再 `in`）。jsonb 欄位不可 `.ilike`。
8. **併發**：狀態轉移用 compare-and-swap——`.update().eq('id',x).eq('status','pending').select('id')` 後檢查 affected rows。
9. **Trigger／SECURITY DEFINER function 必釘 `SET search_path = public`**：未加 schema 的 `is_admin()`/`has_feature()` 在登入等受限 search_path 情境會 42883，**曾造成全公司登入中斷**。
10. **憑證絕不 inline 在指令**：一律從 `.env.local` 或 `~/.claude/notify-release.env` 用腳本讀（Luna 明確要求）。

## 運維流程

- **跑 migration**（pooler 直連不通，走 Management API）：讀 `.env.local` 的 `SUPABASE_ACCESS_TOKEN`，`POST https://api.supabase.com/v1/projects/odzwvkhdrahomgqwlwba/database/query`，body `{ "query": "<SQL>" }`，回 `201 []` 即成功。**線上 migration 一律先取得 Luna 明確授權**（auto mode 的分類器也會擋）；安全作法：先 push 程式碼（flag 關著沒風險），migration 等授權再跑。
- **版本與 CHANGELOG**：CI 在 feat/fix push 後自動 bump patch 並 `[skip ci]` 推回（patch 滿 9 進位 minor）。補 CHANGELOG/docs 用 `[skip ci]`，且先 `git stash -u && git pull --rebase && git stash pop` 避免撞 CI 的 bump commit。
- **Release 通知**：`/notify-release` skill（設定在 `.claude/notify-release.config.json`，SendGrid 憑證在 `~/.claude/notify-release.env`）。feat/fix 且使用者可見 → push 後自動寄；chore/docs 跳過。收件人為全體 active users（單一 personalization，收件人互見，內部通知刻意如此）。
- **UAT 信給 admin**：除摘要外**必附完整 `docs/UAT-checklist.md` 附件**（SendGrid base64），並附上仍關閉的 feature flag 提醒。
- **查線上日誌**：Supabase Management API `GET /v1/projects/<ref>/analytics/endpoints/logs.all?sql=<BQ SQL>&iso_timestamp_start=...&iso_timestamp_end=...`。⚠️ **單次查詢視窗超過約 24 小時會靜默回空**（不是沒錯誤！），要逐日切視窗；留存約 1–7 天。pg_cron 的 `job_run_details` 因 `net.http_post` fire-and-forget **永遠顯示 succeeded**，不可作為健康依據。
- **Vercel**：functions 已固定 `hnd1`（`vercel.json` 的 `regions`），驗證 region 要看 deployment API 不是專案設定頁。Cron 也在 `vercel.json`（daily-digest 平日 08:30、clock-reminder 07:00/17:30、contract-expiry 09:00，皆台北時間；需 `CRON_SECRET` header）。

## 架構速覽（AI 相關）

- **LLM 泛用層** `src/lib/llm.ts`：provider = openai/anthropic/gemini/custom，設定存 `system_settings`（`/admin/settings` 的 AI 連線卡片，含測試鈕與 `ai_last_test` 持久化結果）。敏感 key（`ai_api_key` 等）server 只回 `hasValue`。OpenAI 相容 endpoint 有 `/v1` 正規化（修過 /v1/v1 404）。
- **向量檢索（RAG）**：pgvector `doc_chunks` + `match_doc_chunks()` RPC（cosine、僅 service role、限 REG/ANN/INTERNAL）；embedding 設定獨立（URL/key/model，留空 fallback 到 AI 連線）；`src/lib/embeddings.ts`、`src/lib/doc-index.ts`；`/admin/settings` 有重建索引鈕。政策問答 `src/lib/policy-qa.ts`（向量檢索失敗 fallback 全文）。
- **加班計費** `src/lib/overtime-pay.ts`：依勞基法 §24/§39 分段（`weightedOvertimeHours`、`splitOvertimeSegments`、`suggestDayType`）。

## 近期大事記（背景脈絡）

- **7/11 v0.8.5**：三輪全站 code review（delta → 85 agent 逐模組 → 9 維橫掃）收尾，19 項 low/medium 全清；UAT v2.5（169 項）與 release 信已寄。
- **7/17**：清除 3/31 遺留的 3 支殭屍 Supabase Edge Functions（auto-clock／contract-expiry-reminder／announcement-reminder）+ 4 個 pg_cron job——全部每天失敗或空轉。**產品決策：不做自動補卡**，打卡走 Teams 提醒制。現在 pg_cron 應為 0 個 job、edge functions 應為空，若又出現要問。
- **7/20**：日誌掃描發現上方「立即要處理」清單。**尚未修**。

## 文件地圖

| 檔案 | 內容 |
|---|---|
| `CLAUDE.md` | 網域鐵則 + UI 規範入口 |
| `design-system/myops/MASTER.md` | UI 設計規範（做 UI 前必讀）|
| `docs/ROADMAP.md` | 現況、技術債、待決清單（**最新狀態以此為準**）|
| `docs/CHANGELOG.md` | 到 v0.8.5 的完整變更史 |
| `docs/UAT-checklist.md` | UAT v2.5，40 章 169 項 |
| `docs/HANDOVER.md` | 舊交接文（7/4, v0.6.0），僅歷史參考 |
| `docs/teams-bot-setup.md` | Teams bot 設定 |

## 給接手 session 的第一步建議

1. 跑「新機器環境設定 checklist」。
2. 修「立即要處理」：P0 一支 migration（**先問 Luna 授權**）＋ P1/P2 純程式修改（可先修先 push，migration 另行）。修完以真實帳號實測：建採購單、看首頁公告區塊、出勤管理全員清單、請假代理人下拉。
3. 修完 push → CI bump → `/notify-release`（這批是使用者可見 fix，該寄）→ 更新 `docs/CHANGELOG.md`、UAT 回歸項。
4. 兩件待決事項若 Luna 回覆了，照上方「等 Luna 拍板」的指示落地。
