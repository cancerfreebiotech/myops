-- ============================================================
-- myOPS — 轉單防重 + 分期期數併發保護（本檔尚未套用到正式 DB，需明確授權後執行）
--
-- 配合 src/lib/procurement/conversions.ts 的 app 層檢查，補上 DB 層保證，
-- 關閉併發 TOCTOU 空窗：
--   1) GR→INB：一張進貨驗收單只能有一張非作廢入庫單（重複會重複計庫存）。
--   2) GR→AP ：一張進貨驗收單只能有一張非作廢採購請款單（重複會重複付款）。
--   3) AP→INS：同一採購請款單的分期期數 (installment_no) 不可重複。
--      app 層在 23505 衝突時會重算期數並重試，靠此唯一索引收斂。
--
-- 註：pr_to_dep（訂金請款）刻意「不」設唯一，一張採購單可有多筆訂金請款
--     （autofillDeposit 會加總同一 PR 的多筆訂金），屬正常商業流程。
--
-- ⚠️ 套用前若既有資料已存在重複，建立唯一索引會失敗；需先人工清理/作廢重複列。
-- ============================================================

-- 1) GR → INB 防重【擱置】：線上已有 15 筆一 GR 多入庫單，可能是合理分批入庫；
--    待 Luna 確認採購規則後再決定是否建立此索引（2026-07-11）。
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_orders_gr_active
--   ON inbound_orders (gr_id)
--   WHERE gr_id IS NOT NULL AND status <> 'voided';

-- 2) GR → AP 防重（同一 gr_id 僅一張非作廢採購請款單）
CREATE UNIQUE INDEX IF NOT EXISTS uq_ap_requests_gr_active
  ON ap_requests (gr_id)
  WHERE gr_id IS NOT NULL AND status <> 'voided';

-- 3) AP → INS 分期期數唯一（同一 ap_id 的非作廢分期單期數不可重複）
CREATE UNIQUE INDEX IF NOT EXISTS uq_installment_requests_ap_no_active
  ON installment_requests (ap_id, installment_no)
  WHERE ap_id IS NOT NULL AND installment_no IS NOT NULL AND status <> 'voided';
