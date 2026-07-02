-- ============================================================
-- Daily Report Module — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. PROFILES ─────────────────────────────────────────────
-- Extends Supabase auth.users. Created on first login via trigger.
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  member_name   TEXT,           -- e.g. 'Juno', 'Luna' — set by admin
  display_name  TEXT,           -- Microsoft display name
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','manager')),
  member_role_title TEXT,       -- e.g. '業務', '個管師兼行銷'
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. DAILY SCHEDULES (早上行程) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  items       JSONB NOT NULL DEFAULT '[]',
  -- items format: [{"label":"醫師拜訪","note":"陳明晃"}]
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, date)
);

-- ── 3. DAILY COMPLETIONS (完成回報) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_completions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  items       JSONB NOT NULL DEFAULT '[]',
  -- items format: [{"label":"醫師拜訪","note":"完成","done":true}]
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, date)
);

-- ── 4. KPI ENTRIES (每日 KPI 填報) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.kpi_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  kpi_def_id  TEXT NOT NULL,   -- references kpi_definitions.kpi_id
  value       NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, date, kpi_def_id)
);

-- ── 5. KPI DEFINITIONS (KPI 定義，經理管理) ─────────────────
CREATE TABLE IF NOT EXISTS public.kpi_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kpi_id      TEXT NOT NULL,   -- stable identifier e.g. 'j1', 'k1234567890'
  cat         TEXT NOT NULL DEFAULT '量化',
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT '',
  target      NUMERIC NOT NULL DEFAULT 0,
  period      TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly','yearly')),
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, kpi_id)
);

-- ── 6. TASKS (指派任務) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT DEFAULT '',
  deadline    DATE,
  priority    TEXT NOT NULL DEFAULT 'med' CHECK (priority IN ('high','med','low')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','done')),
  member_done BOOLEAN NOT NULL DEFAULT FALSE,  -- member flagged all subtasks done, awaiting manager confirm
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Task assignees (many-to-many)
CREATE TABLE IF NOT EXISTS public.task_assignees (
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, profile_id)
);

-- Task subtasks
CREATE TABLE IF NOT EXISTS public.task_subtasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. WORK ITEMS (工作事項清單) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.work_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  count_label TEXT DEFAULT '',   -- 次數/組數欄位
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. SCH ITEMS (常用行程項目) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.sch_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_schedules_profile_date ON public.daily_schedules(profile_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_completions_profile_date ON public.daily_completions(profile_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_entries_profile_date ON public.kpi_entries(profile_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_assignees_profile ON public.task_assignees(profile_id);
CREATE INDEX IF NOT EXISTS idx_work_items_profile ON public.work_items(profile_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_sch_items_profile ON public.sch_items(profile_id, sort_order);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','daily_schedules','daily_completions','kpi_entries','kpi_definitions','tasks','work_items']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_schedules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_definitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_subtasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sch_items         ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a manager?
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'manager'
  );
$$;

-- ── PROFILES ────────────────────────────────────────────────
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_manager());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "profiles_manager_update" ON public.profiles FOR UPDATE
  USING (public.is_manager());

-- ── DAILY SCHEDULES ─────────────────────────────────────────
CREATE POLICY "schedules_select" ON public.daily_schedules FOR SELECT
  USING (profile_id = auth.uid() OR public.is_manager());
CREATE POLICY "schedules_insert" ON public.daily_schedules FOR INSERT
  WITH CHECK (profile_id = auth.uid());
CREATE POLICY "schedules_update" ON public.daily_schedules FOR UPDATE
  USING (profile_id = auth.uid());
CREATE POLICY "schedules_delete" ON public.daily_schedules FOR DELETE
  USING (profile_id = auth.uid());

-- ── DAILY COMPLETIONS ────────────────────────────────────────
CREATE POLICY "completions_select" ON public.daily_completions FOR SELECT
  USING (profile_id = auth.uid() OR public.is_manager());
CREATE POLICY "completions_insert" ON public.daily_completions FOR INSERT
  WITH CHECK (profile_id = auth.uid());
CREATE POLICY "completions_update" ON public.daily_completions FOR UPDATE
  USING (profile_id = auth.uid());

-- ── KPI ENTRIES ──────────────────────────────────────────────
CREATE POLICY "kpi_entries_select" ON public.kpi_entries FOR SELECT
  USING (profile_id = auth.uid() OR public.is_manager());
CREATE POLICY "kpi_entries_insert" ON public.kpi_entries FOR INSERT
  WITH CHECK (profile_id = auth.uid());
CREATE POLICY "kpi_entries_update" ON public.kpi_entries FOR UPDATE
  USING (profile_id = auth.uid());

-- ── KPI DEFINITIONS ──────────────────────────────────────────
CREATE POLICY "kpi_defs_select" ON public.kpi_definitions FOR SELECT
  USING (profile_id = auth.uid() OR public.is_manager());
CREATE POLICY "kpi_defs_all_manager" ON public.kpi_definitions FOR ALL
  USING (public.is_manager()) WITH CHECK (public.is_manager());

-- ── TASKS ────────────────────────────────────────────────────
-- Members can see tasks assigned to them; manager sees all
CREATE POLICY "tasks_select_member" ON public.tasks FOR SELECT
  USING (
    public.is_manager() OR
    EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id = tasks.id AND profile_id = auth.uid())
  );
CREATE POLICY "tasks_all_manager" ON public.tasks FOR ALL
  USING (public.is_manager()) WITH CHECK (public.is_manager());
-- Members can update member_done flag only
CREATE POLICY "tasks_update_member_done" ON public.tasks FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id = tasks.id AND profile_id = auth.uid())
  );

-- ── TASK ASSIGNEES ───────────────────────────────────────────
CREATE POLICY "task_assignees_select" ON public.task_assignees FOR SELECT
  USING (profile_id = auth.uid() OR public.is_manager());
CREATE POLICY "task_assignees_all_manager" ON public.task_assignees FOR ALL
  USING (public.is_manager()) WITH CHECK (public.is_manager());

-- ── TASK SUBTASKS ────────────────────────────────────────────
CREATE POLICY "subtasks_select" ON public.task_subtasks FOR SELECT
  USING (
    public.is_manager() OR
    EXISTS (
      SELECT 1 FROM public.task_assignees
      WHERE task_id = task_subtasks.task_id AND profile_id = auth.uid()
    )
  );
CREATE POLICY "subtasks_update_member" ON public.task_subtasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.task_assignees
      WHERE task_id = task_subtasks.task_id AND profile_id = auth.uid()
    )
  );
CREATE POLICY "subtasks_all_manager" ON public.task_subtasks FOR ALL
  USING (public.is_manager()) WITH CHECK (public.is_manager());

-- ── WORK ITEMS ───────────────────────────────────────────────
CREATE POLICY "work_items_select" ON public.work_items FOR SELECT
  USING (profile_id = auth.uid() OR public.is_manager());
CREATE POLICY "work_items_all_own" ON public.work_items FOR ALL
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "work_items_all_manager" ON public.work_items FOR ALL
  USING (public.is_manager()) WITH CHECK (public.is_manager());

-- ── SCH ITEMS ────────────────────────────────────────────────
CREATE POLICY "sch_items_select" ON public.sch_items FOR SELECT
  USING (profile_id = auth.uid() OR public.is_manager());
CREATE POLICY "sch_items_all_own" ON public.sch_items FOR ALL
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "sch_items_all_manager" ON public.sch_items FOR ALL
  USING (public.is_manager()) WITH CHECK (public.is_manager());

-- ============================================================
-- SEED: Initial KPI Definitions
-- (Run after creating profiles for each member)
-- Replace profile_id with actual UUIDs from profiles table
-- ============================================================
/*
INSERT INTO public.kpi_definitions (profile_id, kpi_id, cat, name, unit, target, period, sort_order)
SELECT p.id, 'j1', '量化', '每日拜訪數', '次', 50, 'monthly', 0 FROM public.profiles p WHERE p.member_name = 'Juno'
UNION ALL
SELECT p.id, 'j2', '量化', '新客戶開發數', '家', 5, 'monthly', 1 FROM public.profiles p WHERE p.member_name = 'Juno'
UNION ALL
SELECT p.id, 'i1', '業務', '每日拜訪數', '次', 20, 'monthly', 0 FROM public.profiles p WHERE p.member_name = 'Ian'
UNION ALL
SELECT p.id, 'a1', '個管', '提供行銷部素材病人數', '人', 5, 'monthly', 0 FROM public.profiles p WHERE p.member_name = 'Ana'
UNION ALL
SELECT p.id, 'a2', '個管', '提供Lucia素材病人數', '人', 8, 'monthly', 1 FROM public.profiles p WHERE p.member_name = 'Ana'
UNION ALL
SELECT p.id, 'h1', '個管', '提供行銷部素材病人數', '人', 3, 'monthly', 0 FROM public.profiles p WHERE p.member_name = 'Heather'
UNION ALL
SELECT p.id, 'h2', '個管', '提供Lucia素材病人數', '人', 4, 'monthly', 1 FROM public.profiles p WHERE p.member_name = 'Heather';
*/
