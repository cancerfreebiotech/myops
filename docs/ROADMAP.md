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
| 5 | 出差管理 | 出差申請（審批）→ 行程 → 一鍵轉差旅報帳（串 #1）；顯示於請假日曆 | 2–3 天 |
| 6 | 公司行事曆 | 請假/出差/公司活動一頁月曆；進階：Outlook/Teams 日曆同步 | 2 天（同步 +2）|
| 7 | 營運儀表板 | 管理層 BI：出勤/加班趨勢、採購支出、專案工時、薪資成本 | 3 天 |
| 8 | AI 政策問答 | Teams bot 升級：基於規章/SOP 文件庫的 RAG 問答（如「特休怎麼算」）| 3–4 天 |

## Tier 3 — 規模成長後啟動

| # | 功能 | 觸發條件 |
|---|------|---------|
| 9 | 入職/離職 Checklist | 擴編前（現有 offboarding API 擴成流程化清單）|
| 10 | 招募管理 | 開始擴編（10+ 人）|
| 11 | 績效考核（銜接日報 KPI）| 10+ 人、有考核制度需求 |
| 12 | 試劑/耗材管理（批號/效期）| 若實驗室營運確定納入 myOPS（無 LIMS）|
| 13 | IT/總務服務台 | 回饋量變大時（回饋模組擴成工單）|

---

## 進行中發現的技術債（隨模組開發一併處理）

- ~~`PATCH /api/documents/[id]` 無授權檢查~~ → ✅ 已修（簽核中心開發時鎖定 admin/approve_contract + 欄位白名單）
- ~~補打卡申請沒有審批 endpoint~~ → ✅ 已修（v0.5.2：PATCH + SECURITY DEFINER 寫入出勤）
- ~~薪資權限 key 不一致~~ → ✅ 已修（v0.5.3：FEATURE_KEYS 與程式碼實際檢查對齊，移除 9 個死 key、新增 6 個實際生效 key）
- `createServiceClient` 實為 RLS-as-user（見 `src/lib/supabase/server.ts` 註解）— 不可改為真 service client，除非逐 route 補授權

## 待決策（Luna）

1. 實驗室營運（試劑效期）納不納入 myOPS 範疇 → 影響 #3 範圍與 #12 去留
2. 擴編時程 → 影響 Tier 3 啟動時機
3. PM 舊站歷史資料是否遷移（每日報告模組目前從零開始使用）
