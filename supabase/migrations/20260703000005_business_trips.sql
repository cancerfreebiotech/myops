-- ============================================================
-- myOPS — 出差管理
-- 出差申請 → 主管審批（同請假模式）→ 差旅報帳串接
-- ============================================================

CREATE TABLE IF NOT EXISTS business_trips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination   TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  itinerary     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approver_id   UUID REFERENCES users(id),
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  reject_reason TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_business_trips_user   ON business_trips(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_business_trips_status ON business_trips(status);

ALTER TABLE business_trips ENABLE ROW LEVEL SECURITY;

-- 本人 + 指定審批人 + hr_manager/admin 可讀
DROP POLICY IF EXISTS business_trips_select ON business_trips;
CREATE POLICY business_trips_select
  ON business_trips FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR approver_id = auth.uid()
    OR is_admin() OR has_feature('hr_manager')
  );

DROP POLICY IF EXISTS business_trips_insert ON business_trips;
CREATE POLICY business_trips_insert
  ON business_trips FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 本人（pending 取消/編輯）或審批人/管理者（審批）
DROP POLICY IF EXISTS business_trips_update ON business_trips;
CREATE POLICY business_trips_update
  ON business_trips FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR approver_id = auth.uid()
    OR is_admin() OR has_feature('hr_manager')
  );

-- 差旅報帳串接
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES business_trips(id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_trip ON expense_claims(trip_id) WHERE trip_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON business_trips;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON business_trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Feature flag（預設關閉）
INSERT INTO system_settings (key, value)
VALUES ('feature.business_trip', 'false')
ON CONFLICT (key) DO NOTHING;
