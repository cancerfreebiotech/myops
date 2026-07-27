-- ============================================================
-- myOPS — 詢價單明細 (rfq_items) + 逐項多廠商報價 (rfq_quotes) + 廠商報價單附件
--
-- WHY: 20260612000010 建立 rfqs 時，Ragic 匯出沒有「詢價單明細」子表，因此詢價單
-- 只有表頭。實務流程是：
--   1. 請購人 在詢價單上開列「請購商品」— 項次/商品/規格/單位/數量/用途說明，
--      並可填「建議登錄廠商」(suggested_vendor_id)。 → rfq_items
--   2. 詢價人員 針對「每一個品項」向多家廠商詢價，每家廠商一筆報價
--      (廠商/單價/報價日期/是否採用)。 → rfq_quotes (一個 rfq_item 對多筆)
--      後續 approve 時再依 is_selected 的報價寫回 vendor_products / 建立請採購單。
--   3. 廠商報價單檔案是「整張詢價單」層級、可多檔 → rfqs.quote_files TEXT[]
--      (bucket 'procurement'，存 object path，非 URL)。
--
-- 欄位命名對齊 src/lib/procurement/field-locks.ts 的
-- RFQ_ITEM_LOCKED_FIELDS_IN_APPROVAL（簽核中除詢價人員外唯讀的明細欄位）：
--   品項層 (rfq_items)  : line_no, product_id, product_code, product_name, spec,
--                         quantity, usage_notes, suggested_vendor_id, notes
--   報價層 (rfq_quotes) : vendor_name, vendor_product_code, vendor_product_name
--   quote_file_url      : 依產品決策改為整單層級的 rfqs.quote_files（見上）
--
-- RLS：與 pr_items / rfqs 完全相同的寫法 — 只開 SELECT（採購群組、管理者，或
-- 母單建檔人），所有寫入一律走 service_role (procurementWriteClient) + 應用層授權。
-- 明細寫入沿用 20260721000001 的泛型 RPC
-- procurement_insert_with_items / procurement_update_with_items（表名當參數傳入，
-- 不需要新的 per-table RPC）。
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- RFQ ITEMS (詢價單明細 — 請購商品，由請購人填寫)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rfq_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id              UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE, -- 詢價單號
  line_no             INTEGER,                       -- 項次
  product_id          UUID REFERENCES products(id),
  product_code        TEXT,                          -- 商品編號 (snapshot)
  product_name        TEXT,                          -- 商品名稱 (snapshot)
  spec                TEXT,                          -- 規格 (snapshot)
  unit                TEXT,                          -- 單位 (採購單位 snapshot)
  quantity            NUMERIC,                       -- 需求數量
  usage_notes         TEXT,                          -- 用途說明
  suggested_vendor_id UUID REFERENCES vendors(id),   -- 建議登錄廠商 (請購人填)
  notes               TEXT,                          -- 備註
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq ON rfq_items (rfq_id);

-- ────────────────────────────────────────────────────────────
-- RFQ QUOTES (詢價結果 — 一個品項對多家廠商報價，由詢價人員填寫)
-- 單價為未稅、以採購單位計；is_selected 標記本品項最終採用的那一筆報價。
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rfq_quotes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_item_id         UUID NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE, -- 所屬詢價品項
  vendor_id           UUID REFERENCES vendors(id),
  vendor_name         TEXT,                          -- 廠商名稱 (snapshot)
  vendor_product_code TEXT,                          -- 商品編號 (廠商)
  vendor_product_name TEXT,                          -- 商品名稱 (廠商)
  unit                TEXT,                          -- 單位 (廠商報價單位)
  unit_price          NUMERIC(14,2),                 -- 報價單價 (未稅)
  quote_date          DATE,                          -- 報價日期
  is_selected         BOOLEAN NOT NULL DEFAULT FALSE,-- 是否採用
  notes               TEXT,                          -- 備註
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rfq_quotes_item ON rfq_quotes (rfq_item_id);
CREATE INDEX IF NOT EXISTS idx_rfq_quotes_vendor ON rfq_quotes (vendor_id);

-- ────────────────────────────────────────────────────────────
-- RFQS — 廠商報價單附件 (整單層級、可多檔)
-- 存 storage bucket 'procurement' 的 object path 陣列（非簽名 URL）。
-- ────────────────────────────────────────────────────────────

ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS quote_files TEXT[] NOT NULL DEFAULT '{}'; -- 廠商報價單

-- ────────────────────────────────────────────────────────────
-- RLS — 只讀（採購群組 / 管理者 / 母單建檔人），寫入僅 service role
-- 述詞寫法與 20260612000010 的 pr_items / rfqs 政策一致。
-- ────────────────────────────────────────────────────────────

ALTER TABLE rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rfq_items: procurement or parent owner can read" ON rfq_items;
CREATE POLICY "rfq_items: procurement or parent owner can read"
  ON rfq_items FOR SELECT TO authenticated
  USING (
    has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR
    EXISTS (SELECT 1 FROM rfqs r WHERE r.id = rfq_items.rfq_id AND r.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "rfq_quotes: procurement or parent owner can read" ON rfq_quotes;
CREATE POLICY "rfq_quotes: procurement or parent owner can read"
  ON rfq_quotes FOR SELECT TO authenticated
  USING (
    has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR
    EXISTS (
      SELECT 1 FROM rfq_items i
      JOIN rfqs r ON r.id = i.rfq_id
      WHERE i.id = rfq_quotes.rfq_item_id AND r.created_by = auth.uid()
    )
  );

GRANT SELECT ON rfq_items TO authenticated;
GRANT SELECT ON rfq_quotes TO authenticated;
