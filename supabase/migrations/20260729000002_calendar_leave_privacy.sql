-- ============================================================
-- myOPS — 公司行事曆只顯示「請假中」，不顯示假別（2026-07-29）
--
-- 【為什麼】公司行事曆（/calendar）對「全體登入員工」顯示請假的假別名稱，
-- 其中包含生理假、病假 —— 屬健康個資。同事之間為了排程需要知道「某人不在」，
-- 但不需要知道「為什麼不在」。因此本函式改為只回「誰、哪幾天」，前端一律
-- 顯示為「請假中」。
--
-- 【範圍界定（刻意不動的部分）】
-- calendar_dept_leaves（/leave/calendar 請假行事曆）維持原樣，仍回傳假別與
-- reason，因為它的可見範圍是「同部門 + HR/admin」且是主管排班協調用的功能，
-- 收掉會破壞既有主管視圖。若要進一步收斂，屬政策決定、需另行討論。
--
-- 【實作註記】回傳型別變更無法用 CREATE OR REPLACE，必須先 DROP。DROP 後重建的
-- 新函式會再次套用 Supabase 對 public schema 的預設授權（自動 GRANT 給
-- anon/authenticated），故重建後必須重新明確 GRANT authenticated 並 REVOKE anon
-- （與 20260729000001 的收斂保持一致，否則洞會被 DROP/CREATE 重新打開）。
-- ============================================================

DROP FUNCTION IF EXISTS calendar_overview_leaves(DATE, DATE);

CREATE FUNCTION calendar_overview_leaves(p_from DATE, p_to DATE)
RETURNS TABLE (id UUID, start_date DATE, end_date DATE, display_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lr.id, lr.start_date, lr.end_date, u.display_name
  FROM leave_requests lr
  JOIN users u ON u.id = lr.user_id
  WHERE lr.status = 'approved'
    AND lr.start_date < p_to
    AND lr.end_date >= p_from
$$;

GRANT EXECUTE ON FUNCTION calendar_overview_leaves(DATE, DATE) TO authenticated;
REVOKE ALL ON FUNCTION calendar_overview_leaves(DATE, DATE) FROM anon;
