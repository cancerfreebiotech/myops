# myOPS 功能擴充 Roadmap

> 2026-07-03 由 Luna 核准。每完成一項即更新狀態。
> 原則：每個新模組跑完「migration → lint/tsc/build 全綠 → UAT 章節 → CHANGELOG 累積 → feature flag 預設關閉、admin 開啟後上線」的交付循環。

## 現況

myOPS 已涵蓋：儀表板、每日報告、公告、文件、合約、打卡、請假、加班、薪資、專案、採購（廠商/物料/請購→詢價→驗收→請款/庫存/評鑑）、員工報帳、回饋、管理後台、Teams bot、MFA、三語系（zh-TW/en/ja）。

平台可複用資產：審批流模式（pending→approve/reject + MFA aal2）、feature flag ＋ granted_features 雙層權限、presigned 檔案上傳、閱讀確認、Teams 推播、稽核記錄、xlsx 匯出、到期提醒。

---

## Tier 1 — 補流程缺口（✅ 全部完成）

| # | 功能 | 內容摘要 | 狀態 |
|---|------|---------|------|
| 1 | **員工報帳** | 代墊費用申請（發票上傳）→ 審批（MFA）→ 撥付；Excel 匯出；`expense_approve` 權限 | ✅ **完成**（v0.5.1，2026-07-03）— 待 admin 開啟 `expenses` flag |
| 2 | **統一簽核中心** | `/approvals` 彙總待我審批：請假、加班、補打卡、報帳、文件/合約、薪資、採購；一鍵核准；Dashboard 待辦卡 | ✅ **完成**（v0.5.2，2026-07-03）— 待 admin 開啟 `approvals` flag |
| 3 | **資產與儀器管理** | 資產台帳、領用/歸還、保養與校驗排程＋到期提醒（ISO/TFDA 稽核需求）| ✅ **完成**（v0.5.3，2026-07-03）— 待 admin 開啟 `assets` flag；GR 一鍵轉資產延後（schema 已支援 source_gr_id）|
| 4 | **教育訓練與證照** | 訓練時數記錄、必修指派、結業證明上傳、證照（GCP/生安/輻安）到期提醒 | ✅ **完成**（v0.5.4，2026-07-03）— 待 admin 開啟 `training` flag |

## Tier 2 — 效率與可視性

| # | 功能 | 內容摘要 | 粗估 |
|---|------|---------|------|
| 5 | 出差管理 | 出差申請（審批）→ 一鍵轉差旅報帳；納入簽核中心 | ✅ **完成**（v0.5.5）|
| 6 | 公司行事曆 | 請假/出差/公司活動一頁月曆；進階：Outlook/Teams 日曆同步 | ✅ **完成**（v0.5.6）；Outlook/Teams 同步延後（見 TODO）|
| 7 | 營運儀表板 | 管理層 BI：出勤/加班/請假/採購/報帳 | ✅ **完成**（v0.5.7）；薪資成本圖延後（見 TODO）|
| 8 | AI 政策問答 | Teams bot 升級：基於規章/SOP 文件庫的 RAG 問答（如「特休怎麼算」）| ✅ **完成**（v0.5.8，v1 無向量檢索；升級項見 TODO）|

## Tier 3 — 規模成長後啟動

| # | 功能 | 觸發條件 |
|---|------|---------|
| 9 | 入職/離職 Checklist | 預設範本＋勾選追蹤 | ✅ **完成**（v0.5.9，2026-07-04）|
| 10 | 招募管理 | ✅ **完成**（v0.6.0，2026-07-04）|
| 11 | 績效考核（銜接日報 KPI）| ✅ **完成**（v0.6.1，2026-07-05）— 待 admin 開啟 `performance` flag |
| 12 | 試劑/耗材管理（批號/效期）| ✅ **完成**（v0.6.0，2026-07-04）|
| 13 | IT/總務服務台 | ❌ **不做**（2026-07-04 Luna 決定）|

---

## 進行中發現的技術債（隨模組開發一併處理）

- ~~`PATCH /api/documents/[id]` 無授權檢查~~ → ✅ 已修（簽核中心開發時鎖定 admin/approve_contract + 欄位白名單）
- ~~補打卡申請沒有審批 endpoint~~ → ✅ 已修（v0.5.2：PATCH + SECURITY DEFINER 寫入出勤）
- ~~薪資權限 key 不一致~~ → ✅ 已修（v0.5.3：FEATURE_KEYS 與程式碼實際檢查對齊，移除 9 個死 key、新增 6 個實際生效 key）
- `createServiceClient` 實為 RLS-as-user（見 `src/lib/supabase/server.ts` 註解）— 不可改為真 service client，除非逐 route 補授權
- 簽核中心 UX：對「自己的補打卡申請」應隱藏／停用核准鈕並給明確錯誤訊息（自我核准被 `approve_makeup_request` 拒絕是職責分離的預期行為；2026-07-20 Linda 連按 5 次才發現不是壞掉）— 低優先
- ~~users.deleted_at／document_recipients.id 幽靈欄位查詢＋採購編號 RLS~~ → ✅ **已修**（2026-07-20，v0.8.6，migration 20260720000001 已套用）：詳見 CHANGELOG v0.8.6 與 ONBOARDING.md
- ~~殭屍 Supabase Edge Functions + pg_cron 排程~~ → ✅ **已清除**（2026-07-17，Luna 核准全部移除）：2026-03-31 舊架構遺留的 3 支 edge functions（`auto-clock`／`contract-expiry-reminder`／`announcement-reminder`）＋ 4 個 pg_cron job 每天照跑、每天失敗或空轉（schema 早已改版：`users.deleted_at`、`document_recipients.id` 不存在），因 `net.http_post` fire-and-forget 而從未被發現。已全部 unschedule + 刪除，原始碼有備份。**產品決策：不做自動補卡**，打卡維持 Teams 提醒制（Vercel cron `clock-reminder`）；合約到期/公告提醒由 Vercel cron `/api/teams/*` 路由負責（功能不變）

## TODO backlog（已決策延後，無急迫性）

### v0.7.5 全面 bug review（2026-07-08）後的待決事項
- [x] **加班倍率落地** — ✅ **完成**（2026-07-08，v0.7.6，Luna 核准「依勞基法」方案）：新增 `overtime_requests.day_type`（工作日/休息日/國定假日，依日期自動判斷）＋ `overtime_rates.tier_key`；計薪改依勞基法 §24/§39 分段（migration 20260708000002）。例假日出勤（§40）不納入自動計算
- [x] **待套用 migration**：`20260708000001_gr_convertible_authz_and_dedup.sql`（gr_is_convertible 補授權檢查 + assets.source_gr_id 部分唯一索引關閉併發轉資產空窗）— ✅ **已套用並驗證**（2026-07-08，Luna 授權）
- [x] **overtime_rates 的 is_active 開關** — ✅ **已解決**（2026-07-08，v0.7.6）：決策為「移除開關」——費率為法定分段，只可調倍率不可停用（停用會導致計薪錯誤），不加欄位

### v0.8.4 逐模組深掃（2026-07-11）後的待決 low/medium — ✅ 已於 v0.8.5 清完（2 項擱置/待決）
- [x] [medium] leave：請假行事曆初載改走 calendar_dept_leaves RPC，與換月一致
- [x] [low] overtime：核准/退回改 compare-and-swap（status='pending' 前置）
- [x] [low] overtime：COO 身分判定——通知門檻/名單改 admin client 讀（v0.8.4 已處理主因）
- [x] [low] payroll：異常偵測頁與 API 權限判定對齊
- [x] [low] payroll：無薪假扣款只計當月重疊天數（leaveDaysInMonth）
- [x] [low] contracts：審核副作用改綁真實狀態轉移（approved/rejected），不再因純 metadata 更新重複觸發 COO 通知
- [x] [low] procurement：GR→AP 轉單防重（唯一索引 uq_ap_requests_gr_active）
- [x] [low] procurement：分期期數唯一索引 + 23505 重試收斂
- [x] [low] assets：PATCH 白名單欄位驗證、不外洩 DB 錯誤
- [x] [low] assets：asset_logs 新增 custodian_id 記借用人（migration 20260711000021）
- [x] [low] assets：assets API 補 feature.assets flag 檢查
- [x] [low] lab：入庫失敗回滾批次（避免孤兒批次/重複批號）
- [x] [low] daily-report：8 個 API route 補 feature.daily_report flag 檢查
- [x] [low] daily-report：KPI 切日 flush，未存值送回原日期不再丟失
- [x] [low] calendar：PATCH company_events 補欄位驗證（title 非空等）
- [x] [medium] approvals：補打卡可見範圍改即時 manager_id（+ migration 20260711000022 對齊 RLS）
- [x] [low] lifecycle-recruiting：完成後反勾同步回退 checklist 狀態
- [x] [low] lifecycle-recruiting：lifecycle/recruiting API 補 feature flag 檢查
- [x] [low] admin：審計動作篩選對齊 DB action 集合（含 ai_translate/ocr/remind 等，補 5 個 i18n key）

**擱置 / 待決**：
- [ ] [—] **GR→入庫防重**：線上已有 15 筆一 GR 多入庫單，可能是合理分批入庫。app 層與唯一索引均已撤回/擱置，待 Luna 確認「一 GR 是否可對多入庫單」的採購規則後再決定（2026-07-11）
- [ ] [—] assets/[id] 單筆 API 的 feature flag 檢查（本輪只補了 list/mutation 的 /api/assets/route.ts；單筆路由影響小，未納入）

### v0.8.1 delta 審查（2026-07-09）後的待決事項
- [ ] **月薪制國定假日加班的計薪口徑（需 HR/Luna 確認）**：目前 holiday 加班「外加 時數×2.0×時薪」。月薪制的 base 已含國定假日當日一日工資（有薪例假），加上外加 2x 等於該日給 3 日工資；勞基法 §39「加倍發給」通行解讀為「總計 2 日」（即外加 1x）。若確認採外加 1x，把 `/admin/overtime-rates` 的「國定假日」倍率從 2.00 改成 1.00 即可（無需改程式）；維持現狀則為優於法定的給付，亦合法

### 已完成模組的加強子項
- [x] **資產**：採購驗收單（GR）一鍵轉資產 — ✅ **完成**（2026-07-06；migration 20260706000003）
- [x] **行事曆**：Outlook **單向**同步（myOPS→Outlook）、每人自己 OAuth、核准後自動推送 — ✅ **完成**（2026-07-07，v0.6.8；migration 20260707000001）。登入擷取 refresh token → 請假/出差核准時以當事人身分在其 Outlook 建/刪事件
- [ ] ~~**營運儀表板**：薪資成本圖~~ — ❌ **不做**（2026-07-06 Luna）
- [x] **AI 政策問答升級**：pgvector + embedding 檢索、PDF 文字抽取 — ✅ **完成**（2026-07-08，v0.8.0，Luna 核准提前做）：doc_chunks + match_doc_chunks（migration 20260708000005）、Embedding 設定/測試、重建索引按鈕、核准/OCR/翻譯自動增量索引；PDF 文字抽取由視覺模型 OCR 涵蓋（v0.7.8）

### 舊 PRD 承諾但從未實作（2026-07-05 稽核掃描發現）— ✅ **全部完成**（2026-07-07，v0.6.5）
- [x] **合約到期自動提醒**（90/30 天）— `/api/teams/contract-expiry-reminder` cron（每日台北 09:00）
- [x] **合約核准後通知營運長** + **Teams 審核結果通知**（documents 核准/退回通知上傳者，合約類知會 COO）
- [x] **上傳合約時同公司文件關聯提示** + `related_doc_id` 綁定
- [x] **公告發布者報表「一鍵催人」**（remind-unconfirmed API + 4h 冷卻）
- [x] **公告簽署清單 xlsx 匯出**（`/api/export/announcement-reads`）
- [x] **公告未確認提醒的自訂頻率**（daily-digest 依 `document_recipients.reminder_days` + `last_reminded_at`）
- [x] **專案加班「營運長超額通知」**（超過 `project_ot_coo_threshold_hours` 通知 COO）
- 順修：`document_recipients` schema drift（欄位/RLS 缺失致公告確認子系統一直 400）已修復

### 「未來再評估」項 — ✅ 全部完成（2026-07-07，v0.7.0，Luna 核准提前做）
- [x] 文件 OCR 全文搜尋（OCR/AI endpoint 由 admin 於 /admin/settings 設定）
- [x] 彈性工時班別管理（work_shifts + user_shifts；遲到依班別計算）
- [x] 打卡 GPS 地理圍欄（多辦公室 + enforce 開關，預設關閉）

## 已決策（2026-07-04，Luna）

1. #11 績效考核提前做（開發中）；#13 服務台不做
2. PM 舊站歷史資料不遷移（每日報告從零開始使用）
3. 試劑/耗材已納入 myOPS（v0.6.0 完成）
