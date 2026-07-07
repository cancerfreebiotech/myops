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

## TODO backlog（已決策延後，無急迫性）

### v0.7.4 全面 bug review（2026-07-08）後的待決事項
- [ ] **加班倍率落地**：`overtime_requests.request_type` CHECK 只允許 `('regular','project')`，前端的 ot_type（weekday/weekend/holiday…）無欄位可存、`overtime_rate_id` 也無明確對應（費率表是「前2小時/後2小時」分段制）。需 schema/UX 決策後才能實作
- [ ] **待套用 migration**：`20260708000001_gr_convertible_authz_and_dedup.sql`（gr_is_convertible 補授權檢查 + assets.source_gr_id 部分唯一索引關閉併發轉資產空窗）— 檔案已在 repo，需 Luna 授權後執行
- [ ] **overtime_rates 的 is_active 開關**：DB 無此欄位，管理頁暫顯示全部啟用（倍率編輯可用）；若需要停用某費率需加欄位

### 已完成模組的加強子項
- [x] **資產**：採購驗收單（GR）一鍵轉資產 — ✅ **完成**（2026-07-06；migration 20260706000003）
- [x] **行事曆**：Outlook **單向**同步（myOPS→Outlook）、每人自己 OAuth、核准後自動推送 — ✅ **完成**（2026-07-07，v0.6.8；migration 20260707000001）。登入擷取 refresh token → 請假/出差核准時以當事人身分在其 Outlook 建/刪事件
- [ ] ~~**營運儀表板**：薪資成本圖~~ — ❌ **不做**（2026-07-06 Luna）
- [ ] **AI 政策問答升級**：pgvector + embedding 檢索、PDF 文字抽取 — ⏸ **延後**（2026-07-06 Luna）

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
