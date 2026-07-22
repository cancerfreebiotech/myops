-- ============================================================
-- 出勤打卡紀錄「作廢」（軟作廢，非物理刪除）
-- 出勤紀錄有法定保存義務，故不做 DELETE，改以三欄稽核軌跡標記作廢：
--   voided_at   何時作廢
--   voided_by   由誰作廢（管理端操作者）
--   void_reason 作廢原因（必填，由 API 強制）
-- 計算/匯出處以 voided_at IS NULL 過濾；管理端列表仍顯示（帶標記）。
-- ============================================================

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS voided_by   UUID REFERENCES users(id);

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- ============================================================
-- 補打卡衝突：核准補打卡時，若目標日期已有「已作廢」紀錄，
-- ON CONFLICT DO UPDATE 除了覆寫打卡資料外，另清除作廢三欄，
-- 使該列恢復生效（否則 un-void 前紀錄仍被統計/匯出排除，且不會違反 UNIQUE）。
-- 沿用 security_fixes_3 的最新授權邏輯（以 manager_id 判定核准人、禁本人核准）。
-- MFA 仍由 API route（makeup/[id]）的 aal2 檢查把關。
-- ============================================================
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
      clock_in    = CASE WHEN req.clock_type = 'in'  THEN req.clock_time ELSE attendance_records.clock_in END,
      clock_out   = CASE WHEN req.clock_type = 'out' THEN req.clock_time ELSE attendance_records.clock_out END,
      note        = '補打卡核准',
      -- 目標列若為已作廢，補打卡核准視為重新生效：清除作廢軌跡
      voided_at   = NULL,
      voided_by   = NULL,
      void_reason = NULL;
  ELSE
    UPDATE attendance_makeup_requests
    SET status = 'rejected', reject_reason = p_reject_reason, approved_at = now()
    WHERE id = p_request_id RETURNING * INTO req;
  END IF;

  RETURN req;
END;
$$;
