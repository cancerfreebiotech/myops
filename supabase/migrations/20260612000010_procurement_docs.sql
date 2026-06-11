-- ============================================================
-- myOPS — Procurement Module: Documents (10 doc tables + 3 item tables)
--
-- Common skeleton on every document table:
--   id, doc_no (auto via next_doc_no trigger when NULL),
--   status: draft / in_approval / approved / rejected / voided,
--   current_step, voided_at/voided_by/void_reason,
--   created_by/updated_by, notes, created_at/updated_at
-- Ragic meta columns (wfId, 下一位簽核人, 公司群組, 機密等級, 權限群組,
-- 相關人/群組/部門, 單號預覽, LOCKED, 簽核) are intentionally not mapped.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- RFQS (詢價單 — 採購_詢價單)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rfqs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no                 TEXT UNIQUE,                -- 詢價單號
  status                 TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','in_approval','approved','rejected','voided')),
  current_step           INTEGER,
  request_date           DATE,                       -- 請購日期
  requesting_department  TEXT,                       -- 請購部門
  department             TEXT,                       -- 部門
  requester_id           UUID REFERENCES users(id),  -- 請購人員
  request_notes          TEXT,                       -- 請購備註
  inquirer_id            UUID REFERENCES users(id),  -- 詢價人員
  reviewer_id            UUID REFERENCES users(id),  -- 覆核人員
  review_date            DATE,                       -- 覆核日期
  review_notes           TEXT,                       -- 覆核備註
  urgency                TEXT,                       -- 緊急程度
  expected_delivery_date DATE,                       -- 期望到貨日
  pr_count               INTEGER DEFAULT 0,          -- 請採購單數量
  product_eval_count     INTEGER DEFAULT 0,          -- 商品評估單數量
  voided_at              TIMESTAMPTZ,
  voided_by              UUID REFERENCES users(id),
  void_reason            TEXT,
  notes                  TEXT,
  created_by             UUID REFERENCES users(id),
  updated_by             UUID REFERENCES users(id),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- PURCHASE REQUESTS (請採購單 — 採購_請採購單)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no                  TEXT UNIQUE,                -- 採購單號
  status                  TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','in_approval','approved','rejected','voided')),
  current_step            INTEGER,
  rfq_id                  UUID REFERENCES rfqs(id),   -- 來自詢價單號
  purchaser_id            UUID REFERENCES users(id),  -- 採購人員
  purchase_date           DATE,                       -- 採購日期
  requesting_department   TEXT,                       -- 請購部門
  urgency                 TEXT,                       -- 緊急程度
  fulfillment_status      TEXT,                       -- 狀態 (e.g. 尚未進貨)
  vendor_id               UUID REFERENCES vendors(id),
  vendor_code             TEXT,                       -- 廠商編號
  vendor_name             TEXT,                       -- 廠商名稱
  tax_id                  TEXT,                       -- 統一編號
  contact_person          TEXT,                       -- 聯絡人
  phone                   TEXT,                       -- 電話
  fax                     TEXT,                       -- 傳真
  email                   TEXT,                       -- 電子郵件信箱
  address                 TEXT,                       -- 地址
  delivery_address        TEXT,                       -- 交貨地址
  payment_method          TEXT,                       -- 付款方式
  payment_terms           TEXT,                       -- 付款條件
  incoterms               TEXT,                       -- 國貿條規
  tax_type                TEXT,                       -- 課稅別
  tax_rate                NUMERIC(5,2),               -- 稅率 (%)
  tax_amount              NUMERIC(14,2),              -- 稅額
  subtotal                NUMERIC(14,2),              -- 小計
  shipping_fee            NUMERIC(14,2),              -- 運費
  total_amount            NUMERIC(14,2),              -- 合計金額
  request_expected_date   DATE,                       -- 請購期望日
  required_delivery_date  DATE,                       -- 要求到貨日
  expected_delivery_date  DATE,                       -- 預計到貨日
  closed_date             DATE,                       -- 結案日期
  gr_count                INTEGER DEFAULT 0,          -- 進貨單數量
  deposit_request_count   INTEGER DEFAULT 0,          -- 訂金請款單數量
  voided_at               TIMESTAMPTZ,
  voided_by               UUID REFERENCES users(id),
  void_reason             TEXT,
  notes                   TEXT,                       -- 備註
  created_by              UUID REFERENCES users(id),  -- 建檔人員
  updated_by              UUID REFERENCES users(id),  -- 最後修改人員
  created_at              TIMESTAMPTZ DEFAULT NOW(),  -- 建檔日期時間
  updated_at              TIMESTAMPTZ DEFAULT NOW()   -- 最後修改日期時間
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_rfq ON purchase_requests (rfq_id);

-- ────────────────────────────────────────────────────────────
-- PR ITEMS (採購細項 — 採購_採購細項; unit/price in 採購單位)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pr_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id         UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE, -- 採購單號
  line_no       INTEGER,                       -- 項次
  product_id    UUID REFERENCES products(id),
  product_code  TEXT,                          -- 商品編號 (snapshot)
  product_name  TEXT,                          -- 商品名稱 (snapshot)
  spec          TEXT,                          -- 規格 (snapshot)
  unit          TEXT,                          -- 單位 (採購單位 snapshot)
  purchase_code TEXT,                          -- 商品採購編號
  unit_price    NUMERIC(14,2),                 -- 單價 (採購單位)
  quantity      NUMERIC,                       -- 數量
  amount        NUMERIC(14,2),                 -- 金額
  received_qty  NUMERIC DEFAULT 0,             -- 已進貨數量
  pending_qty   NUMERIC,                       -- 尚未進貨數量
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_items_pr ON pr_items (pr_id);

-- ────────────────────────────────────────────────────────────
-- GOODS RECEIPTS (進貨驗收單 — 採購_進貨驗收單)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS goods_receipts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no                  TEXT UNIQUE,                -- 進貨單號
  status                  TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','in_approval','approved','rejected','voided')),
  current_step            INTEGER,
  pr_id                   UUID REFERENCES purchase_requests(id), -- 來自採購單號
  receiver_id             UUID REFERENCES users(id),  -- 進貨人員
  requesting_department   TEXT,                       -- 請購部門
  vendor_id               UUID REFERENCES vendors(id),
  vendor_code             TEXT,                       -- 廠商編號
  vendor_name             TEXT,                       -- 廠商名稱
  tax_id                  TEXT,                       -- 統一編號
  contact_person          TEXT,                       -- 聯絡人
  phone                   TEXT,                       -- 電話
  fax                     TEXT,                       -- 傳真
  email                   TEXT,                       -- 電子郵件信箱
  tax_type                TEXT,                       -- 課稅別
  tax_rate                NUMERIC(5,2),               -- 稅率 (%)
  tax_amount              NUMERIC(14,2),              -- 稅額
  subtotal                NUMERIC(14,2),              -- 小計
  shipping_fee            NUMERIC(14,2),              -- 運費
  total_amount            NUMERIC(14,2),              -- 合計金額
  has_deposit             BOOLEAN DEFAULT FALSE,      -- 是否已付訂金
  deposit_doc_no          TEXT,                       -- 已付訂金單號
  deposit_paid_amount     NUMERIC(14,2),              -- 已付訂金
  invoice_no              TEXT,                       -- 發票號碼
  invoice_date            DATE,                       -- 發票日期
  invoice_doc_url         TEXT,                       -- 發票單據 (file)
  shipping_doc_url        TEXT,                       -- 出貨單據 (file)
  received_at             TIMESTAMPTZ,                -- 進貨時間
  inspected_at            TIMESTAMPTZ,                -- 驗收時間
  confirmed_inbound_at    TIMESTAMPTZ,                -- 確認入庫時間
  converted_to_inspection BOOLEAN DEFAULT FALSE,      -- 已轉驗收?
  voided_at               TIMESTAMPTZ,
  voided_by               UUID REFERENCES users(id),
  void_reason             TEXT,
  notes                   TEXT,                       -- 備註
  created_by              UUID REFERENCES users(id),  -- 建檔人員
  updated_by              UUID REFERENCES users(id),  -- 最後修改人員
  created_at              TIMESTAMPTZ DEFAULT NOW(),  -- 建檔日期時間
  updated_at              TIMESTAMPTZ DEFAULT NOW()   -- 最後修改日期時間
);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_pr ON goods_receipts (pr_id);

-- ────────────────────────────────────────────────────────────
-- INBOUND ORDERS (入庫單 — 庫存_入庫單(增加)+(新增) merged, is_new_lot flag)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inbound_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no         TEXT UNIQUE,                -- 入庫單號
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','in_approval','approved','rejected','voided')),
  current_step   INTEGER,
  gr_id          UUID REFERENCES goods_receipts(id), -- 進貨驗收編號
  is_new_lot     BOOLEAN NOT NULL DEFAULT FALSE,     -- 新批號新增 vs 既有批號增加
  order_date     DATE,                       -- 日期
  stocked_at     TIMESTAMPTZ,                -- 入庫存日期時間
  inbound_status TEXT,                       -- 入庫存狀態 (e.g. 已入庫)
  voided_at      TIMESTAMPTZ,
  voided_by      UUID REFERENCES users(id),
  void_reason    TEXT,
  notes          TEXT,                       -- 單據備註
  created_by     UUID REFERENCES users(id),  -- 建檔人員
  updated_by     UUID REFERENCES users(id),  -- 最後修改人員
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()   -- 最後修改日期時間
);

CREATE INDEX IF NOT EXISTS idx_inbound_orders_gr ON inbound_orders (gr_id);

-- ────────────────────────────────────────────────────────────
-- INBOUND ITEMS (盤點_新批號入庫清單 / 盤點_無批號入庫清單; qty in 庫存單位)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inbound_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_order_id   UUID NOT NULL REFERENCES inbound_orders(id) ON DELETE CASCADE, -- 入庫單號
  line_no            INTEGER,
  product_id         UUID REFERENCES products(id),
  product_code       TEXT,                          -- 商品編號 (snapshot)
  product_name       TEXT,                          -- 商品名稱 (snapshot)
  spec               TEXT,                          -- 規格 (snapshot)
  unit               TEXT,                          -- 單位 (庫存單位 snapshot)
  warehouse_id       UUID REFERENCES warehouses(id),-- 倉庫代碼/名稱
  warehouse_stock_id UUID REFERENCES warehouse_stock(id),
  stock_code         TEXT,                          -- 庫存編號
  lot_no             TEXT,                          -- 批號
  expiry_date        DATE,                          -- 效期 (new lots)
  quantity           NUMERIC NOT NULL DEFAULT 0,    -- 數量 (庫存單位)
  notes              TEXT,                          -- 備註
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_items_order ON inbound_items (inbound_order_id);

-- ────────────────────────────────────────────────────────────
-- OUTBOUND ORDERS (出庫單 — 庫存_出庫單)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outbound_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no       TEXT UNIQUE,                -- 出庫單號
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','in_approval','approved','rejected','voided')),
  current_step INTEGER,
  order_date   DATE,                       -- 日期 (出庫年/月/日 derivable)
  shipment_no  TEXT,                       -- 出貨單號
  deducted_at  TIMESTAMPTZ,                -- 扣庫存日期時間
  voided_at    TIMESTAMPTZ,
  voided_by    UUID REFERENCES users(id),
  void_reason  TEXT,
  notes        TEXT,                       -- 單據備註
  created_by   UUID REFERENCES users(id),  -- 建檔人員
  updated_by   UUID REFERENCES users(id),  -- 最後修改人員
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()   -- 最後修改日期時間
);

-- ────────────────────────────────────────────────────────────
-- OUTBOUND ITEMS (盤點_出庫清單; qty in 庫存單位)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outbound_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_order_id  UUID NOT NULL REFERENCES outbound_orders(id) ON DELETE CASCADE, -- 出庫單號
  line_no            INTEGER,
  product_id         UUID REFERENCES products(id),
  product_code       TEXT,                          -- 商品編號 (snapshot)
  product_name       TEXT,                          -- 商品名稱 (snapshot)
  spec               TEXT,                          -- 規格 (snapshot)
  unit               TEXT,                          -- 單位 (庫存單位 snapshot)
  warehouse_stock_id UUID REFERENCES warehouse_stock(id),
  stock_code         TEXT,                          -- 庫存編號
  warehouse_qty      NUMERIC,                       -- 倉庫數量 (出庫前)
  used_qty           NUMERIC NOT NULL DEFAULT 0,    -- 使用數量
  qty_after_use      NUMERIC,                       -- 使用後數量
  notes              TEXT,                          -- 備註
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_items_order ON outbound_items (outbound_order_id);

-- ────────────────────────────────────────────────────────────
-- DEPOSIT REQUESTS (訂金請款單 — 審核_訂金請款單)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deposit_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no              TEXT UNIQUE,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','in_approval','approved','rejected','voided')),
  current_step        INTEGER,
  pr_id               UUID REFERENCES purchase_requests(id), -- 請採購單來源
  vendor_id           UUID REFERENCES vendors(id),
  vendor_code         TEXT,                       -- 廠商編號
  vendor_name         TEXT,                       -- 名稱
  vendor_short_name   TEXT,                       -- 簡稱
  deposit_amount      NUMERIC(14,2),              -- 訂金金額
  total_amount        NUMERIC(14,2),              -- 合計金額
  deposit_info_url    TEXT,                       -- 訂金請款資訊 (file)
  remittance_deadline DATE,                       -- 要求匯款期限
  remittance_date     DATE,                       -- 匯款日期
  remittance_month    TEXT,                       -- 匯款月份
  closing_day         TEXT,                       -- 結帳日
  bank_name           TEXT,                       -- 銀行名稱
  bank_branch         TEXT,                       -- 分行名稱
  bank_swift_code     TEXT,                       -- 銀行通匯代號
  bank_account_no     TEXT,                       -- 帳號
  bank_account_name   TEXT,                       -- 戶名
  voided_at           TIMESTAMPTZ,
  voided_by           UUID REFERENCES users(id),
  void_reason         TEXT,
  notes               TEXT,
  created_by          UUID REFERENCES users(id),
  updated_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),  -- 建立日期
  updated_at          TIMESTAMPTZ DEFAULT NOW()   -- 最後更新日期
);

CREATE INDEX IF NOT EXISTS idx_deposit_requests_pr ON deposit_requests (pr_id);

-- ────────────────────────────────────────────────────────────
-- AP REQUESTS (採購請款單 — 審核_採購請款單)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ap_requests (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no                   TEXT UNIQUE,                -- 採購請款單號
  status                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','in_approval','approved','rejected','voided')),
  current_step             INTEGER,
  gr_id                    UUID REFERENCES goods_receipts(id),
  vendor_id                UUID REFERENCES vendors(id),
  vendor_code              TEXT,                       -- 廠商編號
  vendor_name              TEXT,                       -- 名稱
  country                  TEXT,                       -- 國別
  tax_id                   TEXT,                       -- 統一編號
  billing_month            TEXT,                       -- 請款月份
  ap_total_amount          NUMERIC(14,2),              -- 採購請款總金額
  amount_adjustment        NUMERIC(14,2),              -- 金額調整
  adjustment_notes         TEXT,                       -- 調整備註
  total_amount             NUMERIC(14,2),              -- 合計金額
  is_installment           BOOLEAN DEFAULT FALSE,      -- 是否分期
  installment_total_amount NUMERIC(14,2),              -- 已分期請款總金額
  payment_method           TEXT,                       -- 付款方式
  payment_terms            TEXT,                       -- 付款條件
  closing_day              TEXT,                       -- 結帳日
  remittance_deadline      DATE,                       -- 匯款期限
  bank_name                TEXT,                       -- 銀行名稱
  bank_branch              TEXT,                       -- 分行名稱
  bank_swift_code          TEXT,                       -- 銀行通匯代號
  bank_account_no          TEXT,                       -- 帳號
  bank_account_name        TEXT,                       -- 戶名
  voided_at                TIMESTAMPTZ,
  voided_by                UUID REFERENCES users(id),
  void_reason              TEXT,
  notes                    TEXT,
  created_by               UUID REFERENCES users(id),  -- 建立使用者
  updated_by               UUID REFERENCES users(id),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ap_requests_gr ON ap_requests (gr_id);

-- ────────────────────────────────────────────────────────────
-- INSTALLMENT REQUESTS (分期請款單 — 審核_分期請款單)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS installment_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no           TEXT UNIQUE,                -- 請款單號
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','in_approval','approved','rejected','voided')),
  current_step     INTEGER,
  ap_id            UUID REFERENCES ap_requests(id), -- 採購請款單號
  installment_no   INTEGER,                    -- 分期期數 (this installment's sequence)
  billing_month    TEXT,                       -- 請款月份
  amount           NUMERIC(14,2),              -- 金額
  invoice_no       TEXT,                       -- 發票號碼
  invoice_date     DATE,                       -- 發票日期
  invoice_file_url TEXT,                       -- 發票檔案 (file)
  submitted_at     TIMESTAMPTZ,                -- 簽核開始的日期時間
  voided_at        TIMESTAMPTZ,
  voided_by        UUID REFERENCES users(id),
  void_reason      TEXT,
  notes            TEXT,                       -- 備註
  created_by       UUID REFERENCES users(id),  -- 建立使用者
  updated_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installment_requests_ap ON installment_requests (ap_id);

-- ────────────────────────────────────────────────────────────
-- VENDOR EVALUATIONS (廠商審核評估 — 審核_廠商審核評估;
-- on approval the vendor fields are copied into vendors)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor_evaluations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no                TEXT UNIQUE,                -- 廠商評估編號
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','in_approval','approved','rejected','voided')),
  current_step          INTEGER,
  vendor_id             UUID REFERENCES vendors(id), -- set when registered to master
  name                  TEXT,                       -- 名稱
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
  voided_at             TIMESTAMPTZ,
  voided_by             UUID REFERENCES users(id),
  void_reason           TEXT,
  notes                 TEXT,                       -- 備註
  created_by            UUID REFERENCES users(id),  -- 建立使用者
  updated_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- PRODUCT EVALUATIONS (商品審核評估 — 審核_商品審核評估;
-- on approval the reviewed prices are written into vendor_products)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_evaluations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no       TEXT UNIQUE,                -- 商品價格評估編號
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','in_approval','approved','rejected','voided')),
  current_step INTEGER,
  rfq_id       UUID REFERENCES rfqs(id),   -- 來源詢價單
  submitted_by UUID REFERENCES users(id),  -- 送出簽核人
  voided_at    TIMESTAMPTZ,
  voided_by    UUID REFERENCES users(id),
  void_reason  TEXT,
  notes        TEXT,
  created_by   UUID REFERENCES users(id),  -- 建立使用者
  updated_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),  -- 建立日期
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_evaluations_rfq ON product_evaluations (rfq_id);

-- ────────────────────────────────────────────────────────────
-- DOC NUMBER TRIGGERS (fill doc_no on insert when NULL)
-- ────────────────────────────────────────────────────────────

CREATE TRIGGER trg_rfqs_doc_no BEFORE INSERT ON rfqs
  FOR EACH ROW EXECUTE FUNCTION set_procurement_doc_no('rfq', 'RFQ');
CREATE TRIGGER trg_purchase_requests_doc_no BEFORE INSERT ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION set_procurement_doc_no('purchase_request', 'PR');
CREATE TRIGGER trg_goods_receipts_doc_no BEFORE INSERT ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION set_procurement_doc_no('goods_receipt', 'GR');
CREATE TRIGGER trg_inbound_orders_doc_no BEFORE INSERT ON inbound_orders
  FOR EACH ROW EXECUTE FUNCTION set_procurement_doc_no('inbound_order', 'INB');
CREATE TRIGGER trg_outbound_orders_doc_no BEFORE INSERT ON outbound_orders
  FOR EACH ROW EXECUTE FUNCTION set_procurement_doc_no('outbound_order', 'OUT');
CREATE TRIGGER trg_deposit_requests_doc_no BEFORE INSERT ON deposit_requests
  FOR EACH ROW EXECUTE FUNCTION set_procurement_doc_no('deposit_request', 'DEP');
CREATE TRIGGER trg_ap_requests_doc_no BEFORE INSERT ON ap_requests
  FOR EACH ROW EXECUTE FUNCTION set_procurement_doc_no('ap_request', 'AP');
CREATE TRIGGER trg_installment_requests_doc_no BEFORE INSERT ON installment_requests
  FOR EACH ROW EXECUTE FUNCTION set_procurement_doc_no('installment_request', 'INS');
CREATE TRIGGER trg_vendor_evaluations_doc_no BEFORE INSERT ON vendor_evaluations
  FOR EACH ROW EXECUTE FUNCTION set_procurement_doc_no('vendor_evaluation', 'VE');
CREATE TRIGGER trg_product_evaluations_doc_no BEFORE INSERT ON product_evaluations
  FOR EACH ROW EXECUTE FUNCTION set_procurement_doc_no('product_evaluation', 'PE');

-- ────────────────────────────────────────────────────────────
-- RLS — read for procurement features / admin / own documents;
-- writes via service role only (no INSERT/UPDATE/DELETE policies)
-- ────────────────────────────────────────────────────────────

ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfqs: procurement or owner can read"
  ON rfqs FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR created_by = auth.uid());

CREATE POLICY "purchase_requests: procurement or owner can read"
  ON purchase_requests FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR created_by = auth.uid());

CREATE POLICY "pr_items: procurement or parent owner can read"
  ON pr_items FOR SELECT TO authenticated
  USING (
    has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR
    EXISTS (SELECT 1 FROM purchase_requests pr WHERE pr.id = pr_items.pr_id AND pr.created_by = auth.uid())
  );

CREATE POLICY "goods_receipts: procurement or owner can read"
  ON goods_receipts FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR created_by = auth.uid());

CREATE POLICY "inbound_orders: procurement or owner can read"
  ON inbound_orders FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR created_by = auth.uid());

CREATE POLICY "inbound_items: procurement or parent owner can read"
  ON inbound_items FOR SELECT TO authenticated
  USING (
    has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR
    EXISTS (SELECT 1 FROM inbound_orders io WHERE io.id = inbound_items.inbound_order_id AND io.created_by = auth.uid())
  );

CREATE POLICY "outbound_orders: procurement or owner can read"
  ON outbound_orders FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR created_by = auth.uid());

CREATE POLICY "outbound_items: procurement or parent owner can read"
  ON outbound_items FOR SELECT TO authenticated
  USING (
    has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR
    EXISTS (SELECT 1 FROM outbound_orders oo WHERE oo.id = outbound_items.outbound_order_id AND oo.created_by = auth.uid())
  );

CREATE POLICY "deposit_requests: procurement or owner can read"
  ON deposit_requests FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR created_by = auth.uid());

CREATE POLICY "ap_requests: procurement or owner can read"
  ON ap_requests FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR created_by = auth.uid());

CREATE POLICY "installment_requests: procurement or owner can read"
  ON installment_requests FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR created_by = auth.uid());

CREATE POLICY "vendor_evaluations: procurement or owner can read"
  ON vendor_evaluations FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR created_by = auth.uid());

CREATE POLICY "product_evaluations: procurement or owner can read"
  ON product_evaluations FOR SELECT TO authenticated
  USING (has_feature('procurement_unit') OR has_feature('procurement_manage') OR is_admin() OR created_by = auth.uid());
