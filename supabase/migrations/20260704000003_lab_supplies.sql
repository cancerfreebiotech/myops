-- ============================================================
-- myOPS — 試劑/耗材管理（Lab Inventory）
-- 品項 / 批次（批號＋效期）/ 用量記錄；全員可讀、lab_manage 管理
-- ============================================================

CREATE TABLE IF NOT EXISTS lab_supplies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'reagent'
                    CHECK (category IN ('reagent', 'consumable', 'other')),
  catalog_no        TEXT,
  vendor_name       TEXT,
  storage_condition TEXT NOT NULL DEFAULT 'RT'
                    CHECK (storage_condition IN ('RT', '4C', '-20C', '-80C', 'LN2', 'other')),
  unit              TEXT NOT NULL DEFAULT '',
  safety_stock      NUMERIC(12,2) NOT NULL DEFAULT 0,
  note              TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS lab_lots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id     UUID NOT NULL REFERENCES lab_supplies(id) ON DELETE CASCADE,
  lot_no        TEXT NOT NULL,
  expiry_date   DATE,
  quantity      NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_date DATE,
  opened_at     TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'in_stock'
                CHECK (status IN ('in_stock', 'depleted', 'discarded')),
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_lots_supply ON lab_lots(supply_id, status);
CREATE INDEX IF NOT EXISTS idx_lab_lots_expiry ON lab_lots(expiry_date) WHERE status = 'in_stock';

-- 用量/異動記錄（audit trail）
CREATE TABLE IF NOT EXISTS lab_lot_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id         UUID NOT NULL REFERENCES lab_lots(id) ON DELETE CASCADE,
  action         TEXT NOT NULL CHECK (action IN ('receive', 'use', 'open', 'discard', 'adjust')),
  quantity_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  user_id        UUID REFERENCES users(id),
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_lot_logs_lot ON lab_lot_logs(lot_id, created_at DESC);

ALTER TABLE lab_supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_lots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_lot_logs ENABLE ROW LEVEL SECURITY;

-- 全員可讀（庫存透明）；寫入限 admin / lab_manage
DROP POLICY IF EXISTS lab_supplies_select ON lab_supplies;
CREATE POLICY lab_supplies_select
  ON lab_supplies FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR is_admin() OR has_feature('lab_manage'));

DROP POLICY IF EXISTS lab_supplies_write ON lab_supplies;
CREATE POLICY lab_supplies_write
  ON lab_supplies FOR ALL TO authenticated
  USING (is_admin() OR has_feature('lab_manage'))
  WITH CHECK (is_admin() OR has_feature('lab_manage'));

DROP POLICY IF EXISTS lab_lots_select ON lab_lots;
CREATE POLICY lab_lots_select
  ON lab_lots FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS lab_lots_write ON lab_lots;
CREATE POLICY lab_lots_write
  ON lab_lots FOR ALL TO authenticated
  USING (is_admin() OR has_feature('lab_manage'))
  WITH CHECK (is_admin() OR has_feature('lab_manage'));

DROP POLICY IF EXISTS lab_lot_logs_select ON lab_lot_logs;
CREATE POLICY lab_lot_logs_select
  ON lab_lot_logs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS lab_lot_logs_insert ON lab_lot_logs;
CREATE POLICY lab_lot_logs_insert
  ON lab_lot_logs FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR has_feature('lab_manage'));

DROP TRIGGER IF EXISTS set_updated_at ON lab_supplies;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON lab_supplies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON lab_lots;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON lab_lots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO system_settings (key, value)
VALUES ('feature.lab_supplies', 'false')
ON CONFLICT (key) DO NOTHING;
