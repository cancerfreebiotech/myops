-- supabase/migrations/20260707000002_work_shifts.sql
-- ============================================================
-- myOPS — F2 彈性工時班別管理（Work Shifts）
-- work_shifts：班別定義；user_shifts：員工班別指派（含 effective_from 歷史）
-- attendance_records：新增 is_late / late_minutes（此前無任何遲到欄位）
-- 全員可讀班別；admin / hr_manager 管理（沿用 has_feature('hr_manager') 慣例）
-- ============================================================

CREATE TABLE IF NOT EXISTS work_shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  start_time    TIME NOT NULL,                              -- 上班時間（台北牆鐘 HH:MM）
  end_time      TIME NOT NULL,                              -- 下班時間
  work_days     SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- ISO dow：1=一 .. 7=日
  flex_minutes  INTEGER NOT NULL DEFAULT 0,                 -- 彈性/遲到寬限（分）
  break_minutes INTEGER NOT NULL DEFAULT 60,                -- 休息時間（分，計工時用）
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_shifts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id       UUID NOT NULL REFERENCES work_shifts(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  created_by     UUID REFERENCES users(id),
  UNIQUE(user_id, effective_from)                            -- 同一員工同一生效日只有一筆
);

CREATE INDEX IF NOT EXISTS idx_user_shifts_lookup
  ON user_shifts(user_id, effective_from DESC);

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS is_late      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS late_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_shifts ENABLE ROW LEVEL SECURITY;

-- 班別定義：全員可讀（打卡端需讀）；admin/hr 寫入
DROP POLICY IF EXISTS work_shifts_select ON work_shifts;
CREATE POLICY work_shifts_select ON work_shifts FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS work_shifts_write ON work_shifts;
CREATE POLICY work_shifts_write ON work_shifts FOR ALL TO authenticated
  USING (is_admin() OR has_feature('hr_manager'))
  WITH CHECK (is_admin() OR has_feature('hr_manager'));

-- 指派：本人可讀自己的（打卡端以本人 JWT 讀取需要）；admin/hr 可讀全部並管理
DROP POLICY IF EXISTS user_shifts_select ON user_shifts;
CREATE POLICY user_shifts_select ON user_shifts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR has_feature('hr_manager'));
DROP POLICY IF EXISTS user_shifts_write ON user_shifts;
CREATE POLICY user_shifts_write ON user_shifts FOR ALL TO authenticated
  USING (is_admin() OR has_feature('hr_manager'))
  WITH CHECK (is_admin() OR has_feature('hr_manager'));

DROP TRIGGER IF EXISTS set_updated_at ON work_shifts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON work_shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 預設班別（對應現有 default_clock_in_time '09:00' / default_clock_out_time '18:00'）
INSERT INTO work_shifts (name, start_time, end_time, work_days, flex_minutes, break_minutes)
VALUES ('標準班 09:00–18:00', '09:00', '18:00', '{1,2,3,4,5}', 0, 60)
ON CONFLICT DO NOTHING;