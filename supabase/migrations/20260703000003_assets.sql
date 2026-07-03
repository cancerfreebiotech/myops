-- ============================================================
-- myOPS — 資產與儀器管理
-- 資產台帳 + 保養/校驗/領用記錄 + 到期追蹤
-- 檢視：全員；管理：admin 或 asset_manage
-- ============================================================

CREATE TABLE IF NOT EXISTS assets (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_no                 TEXT UNIQUE NOT NULL,
  name                     TEXT NOT NULL,
  category                 TEXT NOT NULL DEFAULT 'it_equipment'
                           CHECK (category IN ('it_equipment', 'instrument', 'furniture', 'other')),
  serial_no                TEXT,
  location                 TEXT,
  custodian_id             UUID REFERENCES users(id),
  status                   TEXT NOT NULL DEFAULT 'in_use'
                           CHECK (status IN ('in_use', 'idle', 'repair', 'retired')),
  purchase_date            DATE,
  purchase_amount          NUMERIC(12,2),
  vendor_name              TEXT,
  source_gr_id             UUID,
  calibration_cycle_months INT,
  next_calibration_date    DATE,
  maintenance_cycle_months INT,
  next_maintenance_date    DATE,
  note                     TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assets_status      ON assets(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_calibration ON assets(next_calibration_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_maintenance ON assets(next_maintenance_date) WHERE deleted_at IS NULL;

-- 保養/校驗/維修/領用/歸還/備註 記錄（audit trail，不可改）
CREATE TABLE IF NOT EXISTS asset_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id         UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  log_type         TEXT NOT NULL
                   CHECK (log_type IN ('maintenance', 'calibration', 'repair', 'checkout', 'checkin', 'note')),
  log_date         DATE NOT NULL,
  performed_by     TEXT,
  user_id          UUID REFERENCES users(id),
  next_due_date    DATE,
  note             TEXT,
  attachment_paths TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_logs_asset ON asset_logs(asset_id, log_date DESC);

ALTER TABLE assets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_logs ENABLE ROW LEVEL SECURITY;

-- 全員可檢視（公司資產透明）；管理限 admin / asset_manage
DROP POLICY IF EXISTS assets_select ON assets;
CREATE POLICY assets_select
  ON assets FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR is_admin() OR has_feature('asset_manage'));

DROP POLICY IF EXISTS assets_insert ON assets;
CREATE POLICY assets_insert
  ON assets FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR has_feature('asset_manage'));

DROP POLICY IF EXISTS assets_update ON assets;
CREATE POLICY assets_update
  ON assets FOR UPDATE TO authenticated
  USING (is_admin() OR has_feature('asset_manage'));

DROP POLICY IF EXISTS assets_delete ON assets;
CREATE POLICY assets_delete
  ON assets FOR DELETE TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS asset_logs_select ON asset_logs;
CREATE POLICY asset_logs_select
  ON asset_logs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS asset_logs_insert ON asset_logs;
CREATE POLICY asset_logs_insert
  ON asset_logs FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR has_feature('asset_manage'));

-- 記錄為 audit trail：僅 admin 可刪，不可更新
DROP POLICY IF EXISTS asset_logs_delete ON asset_logs;
CREATE POLICY asset_logs_delete
  ON asset_logs FOR DELETE TO authenticated
  USING (is_admin());

DROP TRIGGER IF EXISTS set_updated_at ON assets;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 附件 bucket（保養/校驗報告）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('asset-files', 'asset-files', false, 20971520,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "asset-files bucket: authenticated can upload" ON storage.objects;
CREATE POLICY "asset-files bucket: authenticated can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'asset-files');

DROP POLICY IF EXISTS "asset-files bucket: authenticated can read" ON storage.objects;
CREATE POLICY "asset-files bucket: authenticated can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'asset-files');

-- Feature flag（預設關閉）
INSERT INTO system_settings (key, value)
VALUES ('feature.assets', 'false')
ON CONFLICT (key) DO NOTHING;
