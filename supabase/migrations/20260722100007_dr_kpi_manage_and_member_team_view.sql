-- ============================================================
-- T3: KPI 指標管理 + 團隊總覽開放群組成員
--
-- 1. dr_kpi_definitions 增加 active 欄位：
--    「停用」指標＝可恢復的軟停用（歷史 KPI 填報資料保留）。
--    員工端與團隊總覽只顯示 active = TRUE 的指標。
-- 2. 同群組 member 可讀彼此的「行程」與「完成回報」，
--    讓成員能看到彼此今日行程以便互相支援。
--    ⚠️ dr_kpi_definitions / dr_kpi_entries 刻意【不】開放同類
--    policy —— 依需求，一般 member 不得存取彼此的 KPI 資料
--    （KPI 仍僅限本人、admin、該群組 viewer）。
--
-- 本檔為 additive 且可重複執行。
-- ============================================================

-- ── 1. KPI 指標停用欄位 ──────────────────────────────────────
ALTER TABLE dr_kpi_definitions
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 2. Helper：目前使用者是否與 target 同屬一個（未刪除）群組，
--        且 target 在該群組的角色是 member（填報者）────────────
--    SECURITY DEFINER：避免 group_members policy 自我遞迴，
--    並固定 search_path（與既有 dr_* helpers 一致）。
CREATE OR REPLACE FUNCTION dr_is_groupmate_of(target_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM daily_report_group_members me
    JOIN daily_report_group_members m ON m.group_id = me.group_id
    JOIN daily_report_groups g ON g.id = me.group_id AND g.deleted_at IS NULL
    WHERE me.user_id = auth.uid()
      AND m.user_id = target_user_id
      AND m.role = 'member'
  )
$$;

-- ── 3. 行程／完成回報：開放同群組成員讀取 ────────────────────
DROP POLICY IF EXISTS "dr_schedules_groupmate_select" ON daily_schedules;
CREATE POLICY "dr_schedules_groupmate_select"
  ON daily_schedules FOR SELECT TO authenticated
  USING (dr_is_groupmate_of(user_id));

DROP POLICY IF EXISTS "dr_completions_groupmate_select" ON daily_completions;
CREATE POLICY "dr_completions_groupmate_select"
  ON daily_completions FOR SELECT TO authenticated
  USING (dr_is_groupmate_of(user_id));
