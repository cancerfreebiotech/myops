-- ============================================================
-- myOPS — 稅額可覆寫 + 請款防重改到「請購單層級」
--
-- 兩件事，都來自 7/29~7/30 的使用者回報：
--
-- 1) 稅額自動算出但可由使用者覆寫（Scott 22dafc0d + Linda 7/30 留言）
--    現況：請購單的稅額是唯讀、由稅率自動算；驗收單的稅額可填但完全不會自動算。
--    改為兩張單都「自動帶入、可覆寫」。
--    ⚠️ 光把欄位開放輸入是不夠的：purchase-requests 的 POST 與 PATCH 只要帶品項
--    就會呼叫 computeTotals() 無條件覆寫 tax_amount，使用者改的數字下一次存檔
--    就被算回去。所以需要一個明確的「已手動指定」旗標讓伺服器跳過重算。
--
-- 2) 採購請款防重從「一張驗收單一次」改為「一張請購單一次」（Po 2026-07-31 指示）
--    現況缺口：pr_to_gr 沒有防重，同一張請購單可以開出多張驗收單，而每張驗收單
--    各自都能請款一次（uq_ap_requests_gr_active 只管同一個 gr_id）→ 全額重複付款
--    的路徑是通的。7/31 PR-2607-007 就出現兩張同額驗收單（GR-2607-003/004）。
--    分批付款在本系統是用 installment_requests（AP→INS）表達，不是用多張 AP，
--    所以「一張請購單只能有一張非作廢請款單」不會擋掉合法流程。
--
-- 正式庫套用授權：Po（2026-07-31）
-- ============================================================

-- ── 1) 稅額手動覆寫旗標 ─────────────────────────────────────
-- false（預設）＝ 跟著小計×稅率自動算；true ＝ 使用者自己填的，伺服器不要動它。
-- 既有資料一律 false：它們的 tax_amount 本來就是算出來的（PR）或從 PR 抄過來的（GR）。
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS tax_amount_manual BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS tax_amount_manual BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN purchase_requests.tax_amount_manual IS
  'true＝稅額由使用者手動指定，伺服器端 computeTotals 不再用稅率覆寫它';
COMMENT ON COLUMN goods_receipts.tax_amount_manual IS
  'true＝稅額由使用者手動指定，前端不再用小計×稅率覆寫它';

-- ── 2) 請款防重改到請購單層級 ───────────────────────────────
-- ap_requests 原本只有 gr_id。要在 DB 層擋「同一張請購單被請款兩次」，
-- 必須把 pr_id 帶到 ap_requests 上（唯一索引無法跨 join）。
ALTER TABLE ap_requests
  ADD COLUMN IF NOT EXISTS pr_id UUID REFERENCES purchase_requests(id);

COMMENT ON COLUMN ap_requests.pr_id IS
  '來源驗收單所屬的請購單（轉單時帶入）。用於「一張請購單只能請款一次」的唯一索引；Ragic 轉入的歷史請款單沒有 gr_id 也沒有 pr_id，為 NULL 不受限制';

-- 既有資料回填：只有 1 筆有 gr_id（其餘 161 筆是 Ragic 歷史單，gr_id 為 NULL）
UPDATE ap_requests a
   SET pr_id = g.pr_id
  FROM goods_receipts g
 WHERE g.id = a.gr_id
   AND a.pr_id IS NULL
   AND g.pr_id IS NOT NULL;

-- 一張請購單至多一張非作廢請款單。
-- 作廢的不算，所以誤轉可以作廢後重轉（與既有 uq_ap_requests_gr_active 同慣例）。
-- pr_id IS NULL 不受限制：Ragic 歷史單與未來可能出現的「無請購單直接請款」不被擋。
CREATE UNIQUE INDEX IF NOT EXISTS uq_ap_requests_pr_active
  ON ap_requests (pr_id)
  WHERE pr_id IS NOT NULL AND status <> 'voided';

-- 依 pr_id 查請款單（app 層防重檢查會用到）
CREATE INDEX IF NOT EXISTS idx_ap_requests_pr_id ON ap_requests (pr_id);
