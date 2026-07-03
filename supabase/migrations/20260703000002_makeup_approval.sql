-- ============================================================
-- 補打卡審批：核准時將時間寫入 attendance_records
-- attendance_records RLS 只允許本人 INSERT，
-- 故以 SECURITY DEFINER function 原子化執行（內含授權檢查）。
-- 另新增 feature flag `approvals`（統一簽核中心）。
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
  IF NOT (req.approver_id = auth.uid() OR is_admin()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'already_processed';
  END IF;

  IF p_approve THEN
    UPDATE attendance_makeup_requests
    SET status = 'approved', approved_at = now()
    WHERE id = p_request_id
    RETURNING * INTO req;

    INSERT INTO attendance_records (user_id, clock_date, clock_in, clock_out, note)
    VALUES (
      req.user_id,
      req.clock_date,
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
    WHERE id = p_request_id
    RETURNING * INTO req;
  END IF;

  RETURN req;
END;
$$;

-- 統一簽核中心 feature flag（預設關閉）
INSERT INTO system_settings (key, value)
VALUES ('feature.approvals', 'false')
ON CONFLICT (key) DO NOTHING;
