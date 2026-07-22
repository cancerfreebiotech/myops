-- Review fix（commit 9efb464 之 code review 確認項）：
-- 補打卡核准復活已作廢紀錄時，原本無條件把 voided_at/voided_by/void_reason 清空，
-- (1) 抹除了作廢稽核軌跡（與 20260722100004 開頭宣告的保存目的相衝突）；
-- (2) 授權不對稱：作廢需 HR/admin，但任何直屬主管核准補打卡即可反轉。
--
-- 修正：
-- (1) 復活時保留 voided_by，void_reason 改為附註「已重置」而非清空——軌跡留在列上；
-- (2) 目標列若為已作廢，核准人必須是 admin / hr_manager（job_role 或 granted_features），
--     否則 RAISE 'voided_requires_hr'（一般直屬主管不得反轉 HR 的作廢）。

CREATE OR REPLACE FUNCTION approve_makeup_request(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_reject_reason TEXT DEFAULT NULL
)
RETURNS attendance_makeup_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req attendance_makeup_requests;
  v_voided_at TIMESTAMPTZ;
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
    -- 目標日期若已有「已作廢」紀錄：只有 admin / HR 可透過補打卡核准使其復活
    SELECT voided_at INTO v_voided_at
    FROM attendance_records
    WHERE user_id = req.user_id AND clock_date = req.clock_date;

    IF v_voided_at IS NOT NULL AND NOT (
      is_admin()
      OR has_feature('hr_manager')
      OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND job_role = 'hr_manager')
    ) THEN
      RAISE EXCEPTION 'voided_requires_hr';
    END IF;

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
      -- 復活：voided_at 歸零使列重新生效；voided_by 保留、void_reason 附註而非清空（稽核軌跡）
      voided_at   = NULL,
      void_reason = CASE
        WHEN attendance_records.voided_at IS NOT NULL
        THEN COALESCE(attendance_records.void_reason, '') || '（補打卡核准，紀錄已重置）'
        ELSE attendance_records.void_reason
      END;
  ELSE
    UPDATE attendance_makeup_requests
    SET status = 'rejected', reject_reason = p_reject_reason, approved_at = now()
    WHERE id = p_request_id RETURNING * INTO req;
  END IF;

  RETURN req;
END;
$$;
