-- ============================================================
-- myOPS — 一個詢價品項至多只能有一筆「採用」報價
--
-- WHY: rfq_quotes.is_selected 標記該品項最終採用的報價，簽核完成後由
-- registerRfqSelectedQuotes() 依此回寫 vendor_products。原本只有 API 層
-- （pickRfqQuotes）把關「至多一筆採用」，DB 層無約束——若有並發寫入或
-- 未來新增其他寫入路徑（腳本、匯入、直接改庫），就可能出現同一品項多筆
-- is_selected=true，導致回寫產生重複的廠商商品價格。改由 DB 保證。
--
-- 用 partial unique index（僅約束 is_selected = TRUE 的列），未採用的報價
-- 不受影響，仍可同一品項多家並存。
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_quotes_one_selected_per_item
  ON rfq_quotes (rfq_item_id)
  WHERE is_selected;

COMMENT ON INDEX uq_rfq_quotes_one_selected_per_item IS
  '一個 rfq_item 至多一筆 is_selected=TRUE 的報價（未採用的報價不受限）。';
