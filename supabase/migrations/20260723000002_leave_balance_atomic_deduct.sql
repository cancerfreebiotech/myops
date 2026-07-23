-- ============================================================
-- myOPS — 請假餘額原子扣減（修 leave-balance 超扣 race）
-- 原核准流程為 JS read-then-write（讀 used_days → 寫回 used_days = 舊值 + 天數），
-- compare-and-swap 只守在 leave_requests.status，未守餘額列本身；同一餘額列的兩張
-- 不同 pending 單若並發核准，會各自以相同的舊 used_days 覆寫，造成重複扣減／超額。
-- 本函式以單一條件式 UPDATE 原子遞增 used_days，且僅在不超過 total_days 時成立，
-- 回傳 (ok, remaining) 供呼叫端在失敗時回捲核准並顯示剩餘天數。
-- ============================================================

CREATE OR REPLACE FUNCTION deduct_leave_balance(p_balance_id uuid, p_days numeric)
RETURNS TABLE(ok boolean, remaining numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r leave_balances;
BEGIN
  UPDATE leave_balances
     SET used_days = COALESCE(used_days, 0) + p_days
   WHERE id = p_balance_id
     AND COALESCE(used_days, 0) + p_days <= total_days
  RETURNING * INTO r;

  IF r.id IS NOT NULL THEN
    RETURN QUERY SELECT true, (r.total_days - COALESCE(r.used_days, 0));
    RETURN;
  END IF;

  -- 未更新：餘額列不存在或會超額 → 回報目前剩餘（供呼叫端顯示 / 判斷）
  SELECT * INTO r FROM leave_balances WHERE id = p_balance_id;
  IF r.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::numeric;
  ELSE
    RETURN QUERY SELECT false, (r.total_days - COALESCE(r.used_days, 0));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION deduct_leave_balance(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_leave_balance(uuid, numeric) TO authenticated, service_role;
