-- ============================================================
-- myOPS — Procurement Module: Core (counters, masters, stock, approvals)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- DOC COUNTERS + AUTO NUMBERING
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doc_counters (
  doc_type   TEXT NOT NULL,
  period     TEXT NOT NULL,            -- yyMM (Asia/Taipei)
  counter    INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (doc_type, period)
);

-- Serialized by the row lock taken by INSERT ... ON CONFLICT DO UPDATE.
-- Format: PREFIX-YYMM-NNN (e.g. PR-2606-001)
CREATE OR REPLACE FUNCTION next_doc_no(p_doc_type TEXT, p_prefix TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_period  TEXT := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'YYMM');
  v_counter INTEGER;
BEGIN
  INSERT INTO doc_counters (doc_type, period, counter, updated_at)
  VALUES (p_doc_type, v_period, 1, NOW())
  ON CONFLICT (doc_type, period)
  DO UPDATE SET counter = doc_counters.counter + 1, updated_at = NOW()
  RETURNING counter INTO v_counter;

  RETURN p_prefix || '-' || v_period || '-' || lpad(v_counter::TEXT, 3, '0');
END;
$$;

-- Generic BEFORE INSERT trigger: fill doc_no when not provided
-- (IS NULL guard lets the Ragic importer keep original doc numbers).
-- Usage: EXECUTE FUNCTION set_procurement_doc_no('<doc_type>', '<PREFIX>')
CREATE OR REPLACE FUNCTION set_procurement_doc_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.doc_no IS NULL THEN
    NEW.doc_no := next_doc_no(TG_ARGV[0], TG_ARGV[1]);
  END IF;
  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- VENDORS (master — 採購_廠商清冊)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code           TEXT UNIQUE,                -- 廠商編號 (V000xx)
  name                  TEXT NOT NULL,              -- 名稱
  short_name            TEXT,                       -- 簡稱
  vendor_category       TEXT,                       -- 廠商類別
  country               TEXT,                       -- 國別
  tax_id                TEXT,                       -- 統一編號
  phone                 TEXT,                       -- 電話號碼
  fax                   TEXT,                       -- 傳真號碼
  contact_person        TEXT,                       -- 聯絡窗口
  contact_phone         TEXT,                       -- 窗口電話
  contact_mobile        TEXT,                       -- 窗口手機
  contact_email         TEXT,                       -- 窗口E-mail
  accounting_contact    TEXT,                       -- 會計聯絡人
  accounting_phone      TEXT,                       -- 會計電話
  accounting_mobile     TEXT,                       -- 會計手機
  accounting_email      TEXT,                       -- 會計E-mail
  billing_postal_code   TEXT,                       -- 帳單郵遞區號
  billing_city_district TEXT,                       -- 帳單縣市及鄉鎮市區
  street_address        TEXT,                       -- 街道地址
  full_billing_address  TEXT,                       -- 完整帳單地址
  payment_method        TEXT,                       -- 付款方式
  payment_terms         TEXT,                       -- 付款條件
  closing_day           TEXT,                       -- 結帳日
  incoterms             TEXT,                       -- 國貿條規
  bank_name             TEXT,                       -- 銀行名稱
  bank_branch           TEXT,                       -- 分行名稱
  bank_swift_code       TEXT,                       -- 銀行通匯代號
  bank_account_no       TEXT,                       -- 帳號
  bank_account_name     TEXT,                       -- 戶名
  bankbook_copy_url     TEXT,                       -- 匯款帳號存摺影本 (file)
  invoice_seal_url      TEXT,                       -- 公司發票印章 (file)
  paid_in_capital       TEXT,                       -- 實收資本額
  last_year_revenue     TEXT,                       -- 去年營收
  filled_by_id          UUID REFERENCES users(id),  -- 填表人
  filler_signature_url  TEXT,                       -- 填表人簽章 (file)
  filling_department    TEXT,                       -- 填表部門
  notes                 TEXT,                       -- 備註
  created_by            UUID REFERENCES users(id),
  updated_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- ────────────────────────────────────────────────────────────
-- PRODUCTS (master — 採購_商品清冊, dual-unit system)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code       TEXT UNIQUE,                -- 商品編號 (P000xx)
  name               TEXT NOT NULL,              -- 商品名稱
  spec               TEXT,                       -- 規格
  category           TEXT,                       -- 分類
  product_type       TEXT,                       -- 種類
  brand              TEXT,                       -- 廠牌
  primary_source     TEXT,                       -- 主要來源
  item_code          TEXT,                       -- 貨號 (used as barcode)
  image_url          TEXT,                       -- 圖片 (file)
  description        TEXT,                       -- 敘述
  default_department TEXT,                       -- 預設部門
  purchase_unit      TEXT,                       -- 採購單位 (e.g. 箱)
  stock_unit         TEXT,                       -- 庫存單位 (e.g. 瓶) ← CSV 單位
  units_per_purchase NUMERIC NOT NULL DEFAULT 1, -- 1 採購單位 = N 庫存單位
  current_stock_qty  NUMERIC DEFAULT 0,          -- 目前庫存數量 (庫存單位, cached from ledger)
  created_by         UUID REFERENCES users(id),  -- 建檔人員
  updated_by         UUID REFERENCES users(id),  -- 最後修改人員
  created_at         TIMESTAMPTZ DEFAULT NOW(),  -- 建檔日期時間
  updated_at         TIMESTAMPTZ DEFAULT NOW(),  -- 最後修改日期時間
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_products_item_code ON products (item_code);

-- ────────────────────────────────────────────────────────────
-- VENDOR PRODUCTS (master — 採購_商品廠商價格)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor_products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID REFERENCES products(id),
  vendor_id      UUID REFERENCES vendors(id),
  product_code   TEXT,                          -- 商品編號 (snapshot)
  product_name   TEXT,                          -- 商品名稱 (snapshot)
  spec           TEXT,                          -- 規格
  product_type   TEXT,                          -- 種類
  unit           TEXT,                          -- 單位 (採購單位)
  vendor_code    TEXT,                          -- 廠商編號 (snapshot)
  vendor_name    TEXT,                          -- 廠商名稱 (snapshot)
  contact_person TEXT,                          -- 聯絡人
  purchase_code  TEXT,                          -- 採購編號 (P000xx-V000xx-yyMMdd)
  unit_price     NUMERIC(14,2),                 -- 商品價格(未稅), per 採購單位
  quote_date     DATE,                          -- 報價日期
  filled_date    DATE,                          -- 填單日期
  source_rfq_no  TEXT,                          -- 來源詢價單
  created_by     UUID REFERENCES users(id),
  updated_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),     -- 建立日期
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendor_products_product ON vendor_products (product_id);
CREATE INDEX IF NOT EXISTS idx_vendor_products_vendor ON vendor_products (vendor_id);

-- ────────────────────────────────────────────────────────────
-- WAREHOUSES (庫存_倉庫管理)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,          -- 倉庫代碼
  name           TEXT NOT NULL,                 -- 倉庫名稱
  address        TEXT,                          -- 倉庫地址
  contact_person TEXT,                          -- 聯絡人
  phone          TEXT,                          -- 電話
  notes          TEXT,                          -- 備註
  created_by     UUID REFERENCES users(id),     -- 建檔人員
  updated_by     UUID REFERENCES users(id),     -- 最後修改人員
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

-- ────────────────────────────────────────────────────────────
-- WAREHOUSE STOCK (庫存_倉庫庫存 — lot-level, quantities in 庫存單位)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouse_stock (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  product_id   UUID NOT NULL REFERENCES products(id),
  stock_code   TEXT UNIQUE,                     -- 庫存編號 (WH-P000xx-LOT)
  lot_no       TEXT,                            -- 批號
  expiry_date  DATE,                            -- 效期
  quantity     NUMERIC NOT NULL DEFAULT 0,      -- 數量 (庫存單位)
  product_code TEXT,                            -- 商品編號 (snapshot)
  product_name TEXT,                            -- 商品名稱 (snapshot)
  spec         TEXT,                            -- 規格 (snapshot)
  product_type TEXT,                            -- 種類 (snapshot)
  unit         TEXT,                            -- 單位 (庫存單位 snapshot)
  created_by   UUID REFERENCES users(id),       -- 建檔人員
  updated_by   UUID REFERENCES users(id),       -- 最後修改人員
  created_at   TIMESTAMPTZ DEFAULT NOW(),       -- 建檔日期時間
  updated_at   TIMESTAMPTZ DEFAULT NOW()        -- 最後修改日期時間
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product ON warehouse_stock (product_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_lookup ON warehouse_stock (product_id, warehouse_id, lot_no);

-- ────────────────────────────────────────────────────────────
-- STOCK MOVEMENTS (ledger — all quantities in 庫存單位)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_movements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID NOT NULL REFERENCES products(id),
  warehouse_stock_id UUID REFERENCES warehouse_stock(id),
  warehouse_id       UUID REFERENCES warehouses(id),
  delta_qty          NUMERIC NOT NULL,           -- +in / -out (庫存單位)
  movement_type      TEXT NOT NULL CHECK (movement_type IN ('inbound','outbound','adjust','void')),
  doc_type           TEXT,                       -- source document type
  doc_id             UUID,                       -- source document id
  note               TEXT,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_doc ON stock_movements (doc_type, doc_id);

-- ────────────────────────────────────────────────────────────
-- APPROVAL STEPS (shared state for all procurement documents)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS procurement_approval_steps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type         TEXT NOT NULL,
  doc_id           UUID NOT NULL,
  step_no          INTEGER NOT NULL,
  approver_kind    TEXT NOT NULL,                -- job_role | manager_of | doc_field | anyone | user
  approver_value   TEXT,                         -- e.g. 'coo', 'inquirer_id', user id
  resolved_user_id UUID REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','current','approved','rejected','skipped')),
  acted_by         UUID REFERENCES users(id),
  acted_at         TIMESTAMPTZ,
  comment          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (doc_type, doc_id, step_no)
);

CREATE INDEX IF NOT EXISTS idx_approval_steps_inbox
  ON procurement_approval_steps (resolved_user_id, status);

-- ────────────────────────────────────────────────────────────
-- RLS — read for procurement features / admin; writes via service role only
-- ────────────────────────────────────────────────────────────

ALTER TABLE doc_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_approval_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_counters: procurement can read"
  ON doc_counters FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin());

CREATE POLICY "vendors: procurement can read"
  ON vendors FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin());

CREATE POLICY "products: procurement can read"
  ON products FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin());

CREATE POLICY "vendor_products: procurement can read"
  ON vendor_products FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin());

CREATE POLICY "warehouses: procurement can read"
  ON warehouses FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin());

CREATE POLICY "warehouse_stock: procurement can read"
  ON warehouse_stock FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin());

CREATE POLICY "stock_movements: procurement can read"
  ON stock_movements FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin());

CREATE POLICY "procurement_approval_steps: procurement can read"
  ON procurement_approval_steps FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin());

-- No INSERT/UPDATE/DELETE policies: all writes go through API service role.

-- ────────────────────────────────────────────────────────────
-- FEATURE FLAG
-- ────────────────────────────────────────────────────────────

INSERT INTO system_settings (key, value) VALUES
  ('feature.procurement', 'false')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKET (quote files / invoices / signatures)
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('procurement', 'procurement', FALSE, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "procurement bucket: authenticated can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'procurement');

CREATE POLICY "procurement bucket: procurement can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'procurement' AND (
      has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin()
    )
  );
