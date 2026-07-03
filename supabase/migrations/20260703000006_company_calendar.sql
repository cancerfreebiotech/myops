-- ============================================================
-- myOPS — 公司行事曆
-- 公司活動事件表；行事曆頁彙總：活動 + 已核准請假 + 已核准出差
-- ============================================================

CREATE TABLE IF NOT EXISTS company_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_company_events_dates ON company_events(start_date, end_date) WHERE deleted_at IS NULL;

ALTER TABLE company_events ENABLE ROW LEVEL SECURITY;

-- 全員可讀；hr_manager / admin 可管理
DROP POLICY IF EXISTS company_events_select ON company_events;
CREATE POLICY company_events_select
  ON company_events FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR is_admin() OR has_feature('hr_manager'));

DROP POLICY IF EXISTS company_events_write ON company_events;
CREATE POLICY company_events_write
  ON company_events FOR ALL TO authenticated
  USING (is_admin() OR has_feature('hr_manager'))
  WITH CHECK (is_admin() OR has_feature('hr_manager'));

DROP TRIGGER IF EXISTS set_updated_at ON company_events;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON company_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 行事曆需要全員看得到「已核准」的請假與出差（僅日期與假別，行事曆用途）
DROP POLICY IF EXISTS "leave_requests: approved visible to all" ON leave_requests;
CREATE POLICY "leave_requests: approved visible to all"
  ON leave_requests FOR SELECT TO authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS "business_trips: approved visible to all" ON business_trips;
CREATE POLICY "business_trips: approved visible to all"
  ON business_trips FOR SELECT TO authenticated
  USING (status = 'approved');

-- Feature flag（預設關閉）
INSERT INTO system_settings (key, value)
VALUES ('feature.calendar', 'false')
ON CONFLICT (key) DO NOTHING;
