-- ============================================================
-- myOPS — 安全修復 3（2026-07-06 稽核第三批）
-- 涵蓋：補打卡自我核准、薪資狀態機 reject、試劑對已軟刪品項入庫（孤兒庫存）
-- ============================================================

-- ── 1. 薪資：status CHECK 補 'rejected'（原本 reject 一定撞 CHECK 違反）──
ALTER TABLE payroll_records DROP CONSTRAINT IF EXISTS payroll_records_status_check;
ALTER TABLE payroll_records ADD CONSTRAINT payroll_records_status_check
  CHECK (status IN ('draft', 'hr_reviewed', 'finance_confirmed', 'coo_approved', 'paid', 'rejected'));

-- ── 2. 補打卡：核准人以 manager_id 判定（不信任可被竄改的 approver_id）、禁本人核准 ──
-- MFA 仍由 API route（makeup/[id]）的 aal2 檢查把關，與 leave/overtime 一致。
CREATE OR REPLACE FUNCTION approve_makeup_request(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_reject_reason TEXT DEFAULT NULL
)
RETURNS attendance_makeup_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req attendance_makeup_requests;
BEGIN
  SELECT * INTO req FROM attendance_makeup_requests WHERE id = p_request_id FOR UPDATE;
  IF req.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- 不得核准自己的申請（職責分離）
  IF req.user_id = auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 核准人以 users.manager_id 為準（不信任可被竄改的 approver_id）
  IF NOT (
    (SELECT manager_id FROM users WHERE id = req.user_id) = auth.uid()
    OR is_admin()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'already_processed';
  END IF;

  IF p_approve THEN
    UPDATE attendance_makeup_requests
    SET status = 'approved', approved_at = now()
    WHERE id = p_request_id RETURNING * INTO req;

    INSERT INTO attendance_records (user_id, clock_date, clock_in, clock_out, note)
    VALUES (
      req.user_id, req.clock_date,
      CASE WHEN req.clock_type = 'in'  THEN req.clock_time END,
      CASE WHEN req.clock_type = 'out' THEN req.clock_time END,
      '補打卡核准'
    )
    ON CONFLICT (user_id, clock_date) DO UPDATE SET
      clock_in  = CASE WHEN req.clock_type = 'in'  THEN req.clock_time ELSE attendance_records.clock_in END,
      clock_out = CASE WHEN req.clock_type = 'out' THEN req.clock_time ELSE attendance_records.clock_out END,
      note = '補打卡核准';
  ELSE
    UPDATE attendance_makeup_requests
    SET status = 'rejected', reject_reason = p_reject_reason, approved_at = now()
    WHERE id = p_request_id RETURNING * INTO req;
  END IF;

  RETURN req;
END;
$$;

-- BEFORE INSERT trigger：強制 approver_id / 初始狀態，杜絕申請人自設核准人
CREATE OR REPLACE FUNCTION set_makeup_request_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.approver_id   := (SELECT manager_id FROM users WHERE id = NEW.user_id);
  NEW.status        := 'pending';
  NEW.approved_at   := NULL;
  NEW.reject_reason := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_makeup_request_defaults ON attendance_makeup_requests;
CREATE TRIGGER set_makeup_request_defaults
  BEFORE INSERT ON attendance_makeup_requests
  FOR EACH ROW EXECUTE FUNCTION set_makeup_request_defaults();

-- INSERT policy：本人、pending、approver_id 不得為自己（防禦縱深）
DROP POLICY IF EXISTS "makeup_self_insert" ON attendance_makeup_requests;
CREATE POLICY "makeup_self_insert" ON attendance_makeup_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND approver_id IS DISTINCT FROM auth.uid()
  );

-- UPDATE policy：核准人以 manager_id 判定且非本人（實際寫入走 SECURITY DEFINER function，
-- 此 policy 專擋直連 PostgREST 竄改）
DROP POLICY IF EXISTS "makeup_approver_update" ON attendance_makeup_requests;
CREATE POLICY "makeup_approver_update" ON attendance_makeup_requests
  FOR UPDATE TO authenticated
  USING (
    ((SELECT manager_id FROM users WHERE id = attendance_makeup_requests.user_id) = auth.uid()
      AND attendance_makeup_requests.user_id <> auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    ((SELECT manager_id FROM users WHERE id = attendance_makeup_requests.user_id) = auth.uid()
      AND attendance_makeup_requests.user_id <> auth.uid())
    OR is_admin()
  );

-- ── 3. 試劑：禁止對不存在或已軟刪除的品項建立批次（孤兒庫存）──
CREATE OR REPLACE FUNCTION lab_lots_reject_deleted_supply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM lab_supplies WHERE id = NEW.supply_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'supply_not_available' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lab_lots_check_supply ON lab_lots;
CREATE TRIGGER lab_lots_check_supply
  BEFORE INSERT ON lab_lots
  FOR EACH ROW EXECUTE FUNCTION lab_lots_reject_deleted_supply();
