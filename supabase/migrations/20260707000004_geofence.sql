-- supabase/migrations/20260707000002_geofence.sql
-- ============================================================
-- myOPS — F3 打卡地理圍欄（geofence）
-- 多辦公室圍欄 + enforce 開關（預設關閉，不影響現有打卡）
-- 檢視/管理：僅 admin（座標視為敏感）；clock route 以真 service role 讀啟用圍欄
-- ============================================================

CREATE TABLE IF NOT EXISTS geofences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  lat        NUMERIC(10,7) NOT NULL,
  lng        NUMERIC(10,7) NOT NULL,
  radius_m   INT NOT NULL DEFAULT 200 CHECK (radius_m > 0),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofences_active ON geofences(is_active) WHERE is_active;

ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;

-- 僅 admin 可讀寫。clock route 需在無 admin 身分下讀取，故以 createAdminClient()
-- （真 service role，繞過 RLS）讀啟用圍欄 —— 座標不對一般使用者暴露。
DROP POLICY IF EXISTS geofences_admin_all ON geofences;
CREATE POLICY geofences_admin_all
  ON geofences FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 沿用既有 set_updated_at() trigger 函式（多處 migration 已使用）
DROP TRIGGER IF EXISTS set_updated_at ON geofences;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON geofences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- enforce 開關（預設 false：僅記錄座標、不擋打卡，避免上線即擋人）
INSERT INTO system_settings (key, value)
VALUES ('geofence_enforce', 'false')
ON CONFLICT (key) DO NOTHING;