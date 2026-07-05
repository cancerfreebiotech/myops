-- ============================================================
-- myOPS — 績效考核（#11）
-- 目標設定 → 主管核定 → 自評 → 主管評核（MFA），銜接每日報告 KPI
-- ============================================================

-- ── 1. 考核週期（hr_manager/admin 管理）──────────────────────
CREATE TABLE IF NOT EXISTS performance_cycles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_perf_cycles_status ON performance_cycles(status, start_date DESC);

-- ── 2. 個人考核（每人每週期一筆）────────────────────────────
CREATE TABLE IF NOT EXISTS performance_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id          UUID NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manager_id        UUID REFERENCES users(id),
  status            TEXT NOT NULL DEFAULT 'goal_setting'
                    CHECK (status IN ('goal_setting', 'goals_submitted', 'goals_approved', 'pending_manager', 'completed')),
  self_comment      TEXT,
  manager_comment   TEXT,
  manager_score     NUMERIC(4,2) CHECK (manager_score >= 1 AND manager_score <= 5),
  return_reason     TEXT,
  kpi_snapshot      JSONB,
  goals_approved_by UUID REFERENCES users(id),
  goals_approved_at TIMESTAMPTZ,
  completed_by      UUID REFERENCES users(id),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cycle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_perf_reviews_user    ON performance_reviews(user_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_manager ON performance_reviews(manager_id, status);

-- ── 3. 目標（隸屬個人考核）──────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id      UUID NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  weight         INT NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
  self_rating    INT CHECK (self_rating BETWEEN 1 AND 5),
  self_note      TEXT,
  manager_rating INT CHECK (manager_rating BETWEEN 1 AND 5),
  manager_note   TEXT,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perf_goals_review ON performance_goals(review_id, sort_order);

-- ── 4. Helper：目前使用者是否為 target 的直屬主管 ─────────────
CREATE OR REPLACE FUNCTION is_manager_of(target_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = target_user_id AND manager_id = auth.uid()
  )
$$;

-- ── 5. KPI 彙總（銜接每日報告；SECURITY DEFINER 因 dr RLS 只開放
--       群組 viewer，直屬主管/HR 需經此函數授權讀取彙總值）────
CREATE OR REPLACE FUNCTION perf_kpi_summary(target_user_id UUID, from_date DATE, to_date DATE)
RETURNS TABLE (kpi_id TEXT, name TEXT, cat TEXT, unit TEXT, period TEXT, target NUMERIC, actual NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT (
    auth.uid() = target_user_id
    OR is_manager_of(target_user_id)
    OR is_admin()
    OR has_feature('hr_manager')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT d.kpi_id, d.name, d.cat, d.unit, d.period, d.target,
         COALESCE(SUM(e.value), 0) AS actual
  FROM dr_kpi_definitions d
  LEFT JOIN dr_kpi_entries e
    ON e.user_id = d.user_id
   AND e.kpi_def_id = d.kpi_id
   AND e.date BETWEEN from_date AND to_date
  WHERE d.user_id = target_user_id
  GROUP BY d.kpi_id, d.name, d.cat, d.unit, d.period, d.target, d.sort_order
  ORDER BY d.sort_order;
END;
$$;

-- ── 6. updated_at triggers ───────────────────────────────────
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['performance_cycles', 'performance_reviews', 'performance_goals']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t
    );
  END LOOP;
END $$;

-- ── 7. RLS ───────────────────────────────────────────────────
ALTER TABLE performance_cycles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_goals   ENABLE ROW LEVEL SECURITY;

-- 週期：草稿只有 HR/admin 可見；open/closed 全員可見；寫入限 HR/admin
DROP POLICY IF EXISTS perf_cycles_select ON performance_cycles;
CREATE POLICY perf_cycles_select
  ON performance_cycles FOR SELECT TO authenticated
  USING (status <> 'draft' OR is_admin() OR has_feature('hr_manager'));

DROP POLICY IF EXISTS perf_cycles_write ON performance_cycles;
CREATE POLICY perf_cycles_write
  ON performance_cycles FOR ALL TO authenticated
  USING (is_admin() OR has_feature('hr_manager'))
  WITH CHECK (is_admin() OR has_feature('hr_manager'));

-- 考核：本人 + 記錄上的主管 + 直屬主管 + HR/admin 可讀；
-- 本人可建自己的；更新交由 API 狀態機把關（同出差模組模式）
DROP POLICY IF EXISTS perf_reviews_select ON performance_reviews;
CREATE POLICY perf_reviews_select
  ON performance_reviews FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR manager_id = auth.uid()
    OR is_manager_of(user_id) OR is_admin() OR has_feature('hr_manager')
  );

DROP POLICY IF EXISTS perf_reviews_insert ON performance_reviews;
CREATE POLICY perf_reviews_insert
  ON performance_reviews FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin() OR has_feature('hr_manager'));

DROP POLICY IF EXISTS perf_reviews_update ON performance_reviews;
CREATE POLICY perf_reviews_update
  ON performance_reviews FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() OR manager_id = auth.uid()
    OR is_manager_of(user_id) OR is_admin() OR has_feature('hr_manager')
  );

DROP POLICY IF EXISTS perf_reviews_delete ON performance_reviews;
CREATE POLICY perf_reviews_delete
  ON performance_reviews FOR DELETE TO authenticated
  USING (is_admin() OR has_feature('hr_manager'));

-- 目標：讀同考核；本人可寫自己的，主管可更新（評分），HR/admin 全權
DROP POLICY IF EXISTS perf_goals_select ON performance_goals;
CREATE POLICY perf_goals_select
  ON performance_goals FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_manager_of(user_id) OR is_admin() OR has_feature('hr_manager')
    OR EXISTS (
      SELECT 1 FROM performance_reviews r
      WHERE r.id = performance_goals.review_id AND r.manager_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS perf_goals_insert ON performance_goals;
CREATE POLICY perf_goals_insert
  ON performance_goals FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin() OR has_feature('hr_manager'));

DROP POLICY IF EXISTS perf_goals_update ON performance_goals;
CREATE POLICY perf_goals_update
  ON performance_goals FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_manager_of(user_id) OR is_admin() OR has_feature('hr_manager')
    OR EXISTS (
      SELECT 1 FROM performance_reviews r
      WHERE r.id = performance_goals.review_id AND r.manager_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS perf_goals_delete ON performance_goals;
CREATE POLICY perf_goals_delete
  ON performance_goals FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR has_feature('hr_manager'));

-- ── 8. Feature flag（預設關閉）────────────────────────────────
INSERT INTO system_settings (key, value)
VALUES ('feature.performance', 'false')
ON CONFLICT (key) DO NOTHING;
