-- 員工報帳表單調整（Linda 7/29 回報 87f7663a）
--
-- 設計方向與原因：
-- 1. 類別改為會計科目：差旅費 / 交際費 / 職工福利 / 其他費用 / 文具印刷 / 雜支。
--    舊值（transport / meal / supplies）是「使用者角度的用途」，記帳時還要人腦轉換成科目；
--    改成直接用科目命名，報帳單就能直接對帳。既有資料只有 1 筆（且為 cancelled），
--    仍以明確 mapping 轉換而非砍掉重建，避免任何一筆歷史單據變成無效值。
-- 2. 申請月份（claim_month）獨立於費用日期（expense_date）：實務上 7/31 的收據可能算 8 月報帳，
--    月結、與薪資撥款掛在一起時看的是「申請月份」而不是收據日期。存 TEXT 'YYYY-MM' 而非 DATE，
--    是為了直接對應 <input type="month">，也避免「月初第一天」這種假日期被誤當成真的費用日。
-- 3. 發票憑證號碼（invoice_no）：報帳與發票對帳需要，允許空值（收據型報帳沒有發票號碼）。

-- ── 1. 類別 ─────────────────────────────────────────────────────────────
ALTER TABLE expense_claims DROP CONSTRAINT IF EXISTS expense_claims_category_check;

UPDATE expense_claims SET category = CASE category
  WHEN 'transport' THEN 'travel'      -- 交通費 → 差旅費
  WHEN 'meal'      THEN 'welfare'     -- 誤餐／聚餐 → 職工福利
  WHEN 'supplies'  THEN 'stationery'  -- 用品 → 文具印刷
  ELSE category                        -- travel / other 原樣保留
END
WHERE category IN ('transport', 'meal', 'supplies');

ALTER TABLE expense_claims ADD CONSTRAINT expense_claims_category_check
  CHECK (category = ANY (ARRAY[
    'travel',       -- 差旅費
    'entertain',    -- 交際費
    'welfare',      -- 職工福利
    'other',        -- 其他費用
    'stationery',   -- 文具印刷
    'misc'          -- 雜支
  ]));

-- ── 2. 申請月份 ─────────────────────────────────────────────────────────
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS claim_month TEXT;

-- 既有資料以費用日期所屬月份回填（Asia/Taipei 無時差問題：expense_date 是 DATE）
UPDATE expense_claims SET claim_month = to_char(expense_date, 'YYYY-MM')
WHERE claim_month IS NULL;

ALTER TABLE expense_claims
  ALTER COLUMN claim_month SET DEFAULT to_char(timezone('Asia/Taipei', now()), 'YYYY-MM');

ALTER TABLE expense_claims
  ALTER COLUMN claim_month SET NOT NULL;

ALTER TABLE expense_claims DROP CONSTRAINT IF EXISTS expense_claims_claim_month_check;
ALTER TABLE expense_claims ADD CONSTRAINT expense_claims_claim_month_check
  CHECK (claim_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- ── 3. 發票憑證號碼 ─────────────────────────────────────────────────────
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS invoice_no TEXT;

COMMENT ON COLUMN expense_claims.claim_month IS '申請月份 YYYY-MM（預設當月，可與 expense_date 不同月）';
COMMENT ON COLUMN expense_claims.invoice_no IS '發票號碼／憑證號碼，收據型報帳可為空';

-- 月結查詢會走 claim_month
CREATE INDEX IF NOT EXISTS idx_expense_claims_claim_month ON expense_claims (claim_month DESC);
