-- ============================================================
-- Fix 1: feature flags 對所有登入者可讀
--   getFeatureFlags() 的查詢帶著使用者 JWT 執行（RLS as user），
--   而 system_settings 原本只有 is_admin() policy，
--   導致非 admin 讀到 0 筆 → 所有 flag 視為 false → 全模組被鎖。
-- Fix 2: 收緊 daily-report tasks 相關 RLS
--   原 policy 只檢查 dr_is_any_viewer()，任一群組的 viewer
--   可跨群組寫入任何 task/assignee/subtask。
-- Fix 3: 群組 soft-delete 後撤銷 viewer 存取權
-- ============================================================

-- ── 1. FEATURE FLAGS 可讀 ────────────────────────────────────
DROP POLICY IF EXISTS "system_settings: authenticated read feature flags" ON system_settings;
CREATE POLICY "system_settings: authenticated read feature flags"
  ON system_settings FOR SELECT TO authenticated
  USING (key LIKE 'feature.%');

-- ── 2. HELPERS：排除已刪除群組 + 固定 search_path ────────────
CREATE OR REPLACE FUNCTION dr_is_viewer_of(target_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM daily_report_group_members v
    JOIN daily_report_group_members m ON m.group_id = v.group_id
    JOIN daily_report_groups g ON g.id = v.group_id AND g.deleted_at IS NULL
    WHERE v.user_id = auth.uid()
      AND v.role = 'viewer'
      AND m.user_id = target_user_id
      AND m.role = 'member'
  )
$$;

CREATE OR REPLACE FUNCTION dr_is_any_viewer()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM daily_report_group_members gm
    JOIN daily_report_groups g ON g.id = gm.group_id AND g.deleted_at IS NULL
    WHERE gm.user_id = auth.uid() AND gm.role = 'viewer'
  )
$$;

-- 目前使用者可否管理某 task：建立者本人，或該 task 任一 assignee 的 viewer
CREATE OR REPLACE FUNCTION dr_can_manage_task(p_task_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM dr_tasks t
    WHERE t.id = p_task_id AND t.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM dr_task_assignees ta
    WHERE ta.task_id = p_task_id AND dr_is_viewer_of(ta.user_id)
  )
$$;

-- 同群組成員檢查（SECURITY DEFINER 避免 group_members policy 自我遞迴）
CREATE OR REPLACE FUNCTION dr_shares_group_with_me(p_group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM daily_report_group_members gm
    JOIN daily_report_groups g ON g.id = gm.group_id AND g.deleted_at IS NULL
    WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid()
  )
$$;

-- ── 3. GROUP MEMBERS：只能看到自己所屬群組的名單 ─────────────
DROP POLICY IF EXISTS "dr_group_members_self_select" ON daily_report_group_members;
CREATE POLICY "dr_group_members_self_select"
  ON daily_report_group_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR dr_shares_group_with_me(group_id));

-- ── 4. TASKS：viewer 權限限縮到可管理的 task ─────────────────
DROP POLICY IF EXISTS "dr_tasks_viewer_all" ON dr_tasks;

CREATE POLICY "dr_tasks_viewer_insert"
  ON dr_tasks FOR INSERT TO authenticated
  WITH CHECK (dr_is_any_viewer() AND created_by = auth.uid());

CREATE POLICY "dr_tasks_viewer_select"
  ON dr_tasks FOR SELECT TO authenticated
  USING (dr_can_manage_task(id));

CREATE POLICY "dr_tasks_viewer_update"
  ON dr_tasks FOR UPDATE TO authenticated
  USING (dr_can_manage_task(id))
  WITH CHECK (dr_can_manage_task(id));

CREATE POLICY "dr_tasks_viewer_delete"
  ON dr_tasks FOR DELETE TO authenticated
  USING (dr_can_manage_task(id));

-- ── 5. TASK ASSIGNEES：限縮到可管理的 task、可指派的對象 ────
DROP POLICY IF EXISTS "dr_task_assignees_viewer_all" ON dr_task_assignees;

CREATE POLICY "dr_task_assignees_viewer_select"
  ON dr_task_assignees FOR SELECT TO authenticated
  USING (dr_can_manage_task(task_id));

CREATE POLICY "dr_task_assignees_viewer_insert"
  ON dr_task_assignees FOR INSERT TO authenticated
  WITH CHECK (
    dr_can_manage_task(task_id)
    AND (dr_is_viewer_of(user_id) OR user_id = auth.uid())
  );

CREATE POLICY "dr_task_assignees_viewer_delete"
  ON dr_task_assignees FOR DELETE TO authenticated
  USING (dr_can_manage_task(task_id));

-- ── 6. SUBTASKS：限縮到可管理的 task ─────────────────────────
DROP POLICY IF EXISTS "dr_subtasks_viewer_all" ON dr_task_subtasks;

CREATE POLICY "dr_subtasks_viewer_select"
  ON dr_task_subtasks FOR SELECT TO authenticated
  USING (dr_can_manage_task(task_id));

CREATE POLICY "dr_subtasks_viewer_insert"
  ON dr_task_subtasks FOR INSERT TO authenticated
  WITH CHECK (dr_can_manage_task(task_id));

CREATE POLICY "dr_subtasks_viewer_update"
  ON dr_task_subtasks FOR UPDATE TO authenticated
  USING (dr_can_manage_task(task_id))
  WITH CHECK (dr_can_manage_task(task_id));

CREATE POLICY "dr_subtasks_viewer_delete"
  ON dr_task_subtasks FOR DELETE TO authenticated
  USING (dr_can_manage_task(task_id));

-- ── 7. 欄位限制 TRIGGERS ─────────────────────────────────────
-- RLS 無法限制「member 只能改 member_done」這種欄位級規則，用 trigger 補。
-- auth.uid() IS NULL = service role（migration／維運腳本），不受限。

CREATE OR REPLACE FUNCTION dr_enforce_task_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'created_by is immutable';
  END IF;

  -- 純 assignee（非建立者、非可管理 viewer）只能改 member_done
  IF OLD.created_by IS DISTINCT FROM auth.uid() AND NOT dr_can_manage_task(OLD.id) THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.content IS DISTINCT FROM OLD.content
       OR NEW.deadline IS DISTINCT FROM OLD.deadline
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'assignees may only update member_done';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dr_tasks_enforce_update ON dr_tasks;
CREATE TRIGGER dr_tasks_enforce_update
  BEFORE UPDATE ON dr_tasks
  FOR EACH ROW EXECUTE FUNCTION dr_enforce_task_update();

CREATE OR REPLACE FUNCTION dr_enforce_subtask_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;

  IF NEW.task_id IS DISTINCT FROM OLD.task_id THEN
    RAISE EXCEPTION 'task_id is immutable';
  END IF;

  -- 純 assignee 只能改 done
  IF NOT dr_can_manage_task(OLD.task_id) THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
      RAISE EXCEPTION 'assignees may only update done';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dr_subtasks_enforce_update ON dr_task_subtasks;
CREATE TRIGGER dr_subtasks_enforce_update
  BEFORE UPDATE ON dr_task_subtasks
  FOR EACH ROW EXECUTE FUNCTION dr_enforce_subtask_update();
