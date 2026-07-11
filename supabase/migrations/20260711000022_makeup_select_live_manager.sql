-- ============================================================
-- 補打卡「待我審」可見範圍改用即時 manager_id（與請假/加班一致）
-- ------------------------------------------------------------
-- 背景：attendance_makeup_requests 的 SELECT policy「makeup_approver_read」
-- 原本以 approver_id = auth.uid() 判定（申請時快照的核准人）。主管異動後此快照
-- 會指向舊主管，導致新主管在 RLS 下讀不到部屬的待審補打卡，舊主管卻仍讀得到——
-- 與 approve_makeup_request()（20260706000001）及 leave_requests SELECT policy
-- （皆以即時 manager_id 判定）不一致。
--
-- 本 migration 將 SELECT policy 對齊「即時直屬主管」判定，使
--   GET /api/approvals（改以 user_id ∈ 我的部屬 過濾）在 RLS-as-user 下能正確讀取。
-- self / admin 讀取維持不變。
--
-- ⚠️ 未執行：依專案規範，migration 一律只寫檔不執行，待人工於正式環境套用。
-- ============================================================

DROP POLICY IF EXISTS "makeup_approver_read" ON attendance_makeup_requests;
CREATE POLICY "makeup_approver_read" ON attendance_makeup_requests
  FOR SELECT TO authenticated
  USING (
    (SELECT manager_id FROM users WHERE id = attendance_makeup_requests.user_id) = auth.uid()
  );
