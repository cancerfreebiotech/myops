-- ============================================================
-- myOPS — 安全修復 2（2026-07-05 稽核第二批）
-- 涵蓋：自我提權為 admin（critical）、請假/加班自我核准、文件狀態越權變更
-- ============================================================

-- ── 1. CRITICAL：禁止非 admin 透過 self-update 竄改敏感欄位 ────
-- users「self can update own non-sensitive fields」policy 的 WITH CHECK 只有
-- id=auth.uid()，未限制欄位，任何人可把自己 role 改成 'admin' 或加 granted_features。
-- 合法的本人自助更新僅 language/theme（見 settings/sidebar）。
CREATE OR REPLACE FUNCTION users_self_update_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_admin() THEN
    RETURN NEW;  -- admin 走 admin policy，不受限
  END IF;
  IF NEW.role             IS DISTINCT FROM OLD.role
     OR NEW.granted_features IS DISTINCT FROM OLD.granted_features
     OR NEW.is_active     IS DISTINCT FROM OLD.is_active
     OR NEW.manager_id    IS DISTINCT FROM OLD.manager_id
     OR NEW.department_id  IS DISTINCT FROM OLD.department_id
     OR NEW.deputy_approver_id IS DISTINCT FROM OLD.deputy_approver_id
     OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
     OR NEW.job_role      IS DISTINCT FROM OLD.job_role
     OR NEW.email         IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'forbidden: cannot modify privileged fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_self_update_guard ON users;
CREATE TRIGGER users_self_update_guard
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_self_update_guard();

-- ── 2. 請假：UPDATE 補 WITH CHECK，擋申請人自我核准 ──────────
-- 原 policy 僅 USING（含 user_id=auth.uid()）、無 WITH CHECK，route 又未檢查核准人身分，
-- 申請人可把自己的單改 approved。此處於 DB 層擋下：本人只能維持 pending 或取消，
-- 核准/退回限 直屬主管 / hr_manager / admin。
DROP POLICY IF EXISTS "leave_requests: self can cancel, approver can approve/reject" ON leave_requests;
CREATE POLICY "leave_requests: self can cancel, approver can approve/reject"
  ON leave_requests FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin() OR has_feature('hr_manager')
    OR (SELECT manager_id FROM users WHERE id = leave_requests.user_id) = auth.uid()
  )
  WITH CHECK (
    (user_id = auth.uid() AND status IN ('pending', 'cancelled'))
    OR is_admin() OR has_feature('hr_manager')
    OR (SELECT manager_id FROM users WHERE id = leave_requests.user_id) = auth.uid()
  );

-- ── 3. 加班：同上（保留原 USING 的主管/專案負責人/coo 核准路徑）────
DROP POLICY IF EXISTS "overtime_requests: approvers can update" ON overtime_requests;
CREATE POLICY "overtime_requests: approvers can update"
  ON overtime_requests FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin()
    OR (SELECT manager_id FROM users WHERE id = overtime_requests.user_id) = auth.uid()
    OR project_id IN (SELECT id FROM projects WHERE project_lead_id = auth.uid())
    OR has_feature('coo_notify')
  )
  WITH CHECK (
    (user_id = auth.uid() AND status IN ('pending', 'cancelled'))
    OR is_admin()
    OR (SELECT manager_id FROM users WHERE id = overtime_requests.user_id) = auth.uid()
    OR project_id IN (SELECT id FROM projects WHERE project_lead_id = auth.uid())
    OR has_feature('coo_notify')
  );

-- ── 4. 文件：僅 admin / approve_contract 可變更 status（狀態越權）──
-- documents UPDATE policy 允許 uploaded_by=auth.uid()，使上傳者可自行把文件改 approved，
-- 繞過合約審核。以 trigger 限制：改變 status 者必須 admin 或具 approve_contract。
CREATE OR REPLACE FUNCTION documents_status_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status)
     AND NOT (is_admin() OR has_feature('approve_contract')) THEN
    RAISE EXCEPTION 'forbidden: only approvers can change document status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_status_guard ON documents;
CREATE TRIGGER documents_status_guard
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_status_guard();
