-- ============================================================
-- myOPS — Daily Report Module
-- ============================================================

-- ── 1. GROUPS ────────────────────────────────────────────────
CREATE TABLE daily_report_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ── 2. GROUP MEMBERS ─────────────────────────────────────────
-- role: 'member' = fills daily reports; 'viewer' = can read all members in this group
CREATE TABLE daily_report_group_members (
  group_id UUID NOT NULL REFERENCES daily_report_groups(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'viewer')),
  PRIMARY KEY (group_id, user_id)
);

-- ── 3. DAILY SCHEDULES (早上行程填報) ───────────────────────
-- items: [{"label":"醫師拜訪","note":"陳明晃"}]
CREATE TABLE daily_schedules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  items      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ── 4. DAILY COMPLETIONS (完成回報) ─────────────────────────
-- items: [{"label":"醫師拜訪","note":"完成","done":true}]
CREATE TABLE daily_completions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  items      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ── 5. KPI DEFINITIONS (KPI 指標定義，per-user，由 viewer 管理) ─
CREATE TABLE dr_kpi_definitions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kpi_id     TEXT NOT NULL,
  cat        TEXT NOT NULL DEFAULT '量化',
  name       TEXT NOT NULL,
  unit       TEXT NOT NULL DEFAULT '',
  target     NUMERIC NOT NULL DEFAULT 0,
  period     TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'yearly')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, kpi_id)
);

-- ── 6. KPI ENTRIES (每日 KPI 填報) ──────────────────────────
CREATE TABLE dr_kpi_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  kpi_def_id TEXT NOT NULL,
  value      NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, kpi_def_id)
);

-- ── 7. TASKS (指派任務) ──────────────────────────────────────
CREATE TABLE dr_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT DEFAULT '',
  deadline    DATE,
  priority    TEXT NOT NULL DEFAULT 'med' CHECK (priority IN ('high', 'med', 'low')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'done')),
  member_done BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Task assignees (many-to-many)
CREATE TABLE dr_task_assignees (
  task_id    UUID NOT NULL REFERENCES dr_tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

-- Task subtasks
CREATE TABLE dr_task_subtasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES dr_tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. WORK ITEMS (工作事項樣板，per-user) ───────────────────
CREATE TABLE dr_work_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  count_label TEXT DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. SCH ITEMS (常用行程項目樣板，per-user) ────────────────
CREATE TABLE dr_sch_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_dr_schedules_user_date    ON daily_schedules(user_id, date DESC);
CREATE INDEX idx_dr_completions_user_date  ON daily_completions(user_id, date DESC);
CREATE INDEX idx_dr_kpi_entries_user_date  ON dr_kpi_entries(user_id, date DESC);
CREATE INDEX idx_dr_kpi_defs_user         ON dr_kpi_definitions(user_id, sort_order);
CREATE INDEX idx_dr_tasks_status          ON dr_tasks(status);
CREATE INDEX idx_dr_task_assignees_user   ON dr_task_assignees(user_id);
CREATE INDEX idx_dr_work_items_user       ON dr_work_items(user_id, sort_order);
CREATE INDEX idx_dr_sch_items_user        ON dr_sch_items(user_id, sort_order);
CREATE INDEX idx_dr_group_members_group   ON daily_report_group_members(group_id);
CREATE INDEX idx_dr_group_members_user    ON daily_report_group_members(user_id);

-- ============================================================
-- UPDATED_AT FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'daily_report_groups','daily_schedules','daily_completions',
    'dr_kpi_definitions','dr_kpi_entries','dr_tasks','dr_work_items'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t
    );
  END LOOP;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE daily_report_groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_schedules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_completions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE dr_kpi_definitions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dr_kpi_entries              ENABLE ROW LEVEL SECURITY;
ALTER TABLE dr_tasks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dr_task_assignees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE dr_task_subtasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE dr_work_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE dr_sch_items                ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a viewer of a given user's reports?
CREATE OR REPLACE FUNCTION dr_is_viewer_of(target_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM daily_report_group_members v
    JOIN daily_report_group_members m ON m.group_id = v.group_id
    WHERE v.user_id = auth.uid()
      AND v.role = 'viewer'
      AND m.user_id = target_user_id
      AND m.role = 'member'
  )
$$;

-- Helper: is current user in any group as viewer?
CREATE OR REPLACE FUNCTION dr_is_any_viewer()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM daily_report_group_members
    WHERE user_id = auth.uid() AND role = 'viewer'
  )
$$;

-- ── GROUPS ───────────────────────────────────────────────────
CREATE POLICY "dr_groups_admin_all"
  ON daily_report_groups FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "dr_groups_viewer_select"
  ON daily_report_groups FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      is_admin() OR
      EXISTS (
        SELECT 1 FROM daily_report_group_members
        WHERE group_id = daily_report_groups.id AND user_id = auth.uid()
      )
    )
  );

-- ── GROUP MEMBERS ────────────────────────────────────────────
CREATE POLICY "dr_group_members_admin_all"
  ON daily_report_group_members FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "dr_group_members_self_select"
  ON daily_report_group_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR dr_is_any_viewer());

-- ── DAILY SCHEDULES ──────────────────────────────────────────
CREATE POLICY "dr_schedules_own"
  ON daily_schedules FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "dr_schedules_viewer_select"
  ON daily_schedules FOR SELECT TO authenticated
  USING (is_admin() OR dr_is_viewer_of(user_id));

-- ── DAILY COMPLETIONS ────────────────────────────────────────
CREATE POLICY "dr_completions_own"
  ON daily_completions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "dr_completions_viewer_select"
  ON daily_completions FOR SELECT TO authenticated
  USING (is_admin() OR dr_is_viewer_of(user_id));

-- ── KPI DEFINITIONS ──────────────────────────────────────────
CREATE POLICY "dr_kpi_defs_own_select"
  ON dr_kpi_definitions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR dr_is_viewer_of(user_id));

CREATE POLICY "dr_kpi_defs_viewer_write"
  ON dr_kpi_definitions FOR ALL TO authenticated
  USING (is_admin() OR dr_is_viewer_of(user_id))
  WITH CHECK (is_admin() OR dr_is_viewer_of(user_id));

-- ── KPI ENTRIES ──────────────────────────────────────────────
CREATE POLICY "dr_kpi_entries_own"
  ON dr_kpi_entries FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "dr_kpi_entries_viewer_select"
  ON dr_kpi_entries FOR SELECT TO authenticated
  USING (is_admin() OR dr_is_viewer_of(user_id));

-- ── TASKS ────────────────────────────────────────────────────
CREATE POLICY "dr_tasks_admin_all"
  ON dr_tasks FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "dr_tasks_viewer_all"
  ON dr_tasks FOR ALL TO authenticated
  USING (dr_is_any_viewer() AND (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM dr_task_assignees ta
      JOIN daily_report_group_members vm ON vm.user_id = ta.user_id
      JOIN daily_report_group_members vw ON vw.group_id = vm.group_id AND vw.user_id = auth.uid() AND vw.role = 'viewer'
      WHERE ta.task_id = dr_tasks.id
    )
  ))
  WITH CHECK (dr_is_any_viewer());

CREATE POLICY "dr_tasks_member_select"
  ON dr_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM dr_task_assignees WHERE task_id = dr_tasks.id AND user_id = auth.uid())
  );

CREATE POLICY "dr_tasks_member_update_done"
  ON dr_tasks FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM dr_task_assignees WHERE task_id = dr_tasks.id AND user_id = auth.uid())
  );

-- ── TASK ASSIGNEES ───────────────────────────────────────────
CREATE POLICY "dr_task_assignees_admin_all"
  ON dr_task_assignees FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "dr_task_assignees_viewer_all"
  ON dr_task_assignees FOR ALL TO authenticated
  USING (dr_is_any_viewer()) WITH CHECK (dr_is_any_viewer());

CREATE POLICY "dr_task_assignees_member_select"
  ON dr_task_assignees FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── TASK SUBTASKS ────────────────────────────────────────────
CREATE POLICY "dr_subtasks_admin_all"
  ON dr_task_subtasks FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "dr_subtasks_viewer_all"
  ON dr_task_subtasks FOR ALL TO authenticated
  USING (dr_is_any_viewer()) WITH CHECK (dr_is_any_viewer());

CREATE POLICY "dr_subtasks_member_select"
  ON dr_task_subtasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dr_task_assignees
      WHERE task_id = dr_task_subtasks.task_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "dr_subtasks_member_update"
  ON dr_task_subtasks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dr_task_assignees
      WHERE task_id = dr_task_subtasks.task_id AND user_id = auth.uid()
    )
  );

-- ── WORK ITEMS ───────────────────────────────────────────────
CREATE POLICY "dr_work_items_own"
  ON dr_work_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "dr_work_items_viewer_select"
  ON dr_work_items FOR SELECT TO authenticated
  USING (is_admin() OR dr_is_viewer_of(user_id));

-- ── SCH ITEMS ────────────────────────────────────────────────
CREATE POLICY "dr_sch_items_own"
  ON dr_sch_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "dr_sch_items_viewer_select"
  ON dr_sch_items FOR SELECT TO authenticated
  USING (is_admin() OR dr_is_viewer_of(user_id));

-- ============================================================
-- FEATURE FLAG
-- ============================================================
INSERT INTO system_settings (key, value) VALUES ('feature.daily_report', 'false')
ON CONFLICT (key) DO NOTHING;
