-- ============================================================
-- myOPS — 修復行事曆 RLS 欄位洩漏（2026-07-06）
-- 問題：company_calendar 為了行事曆加了「已核准全員可讀」的 row policy，
-- 使任何登入者可直打 PostgREST 讀他人請假 reason/attachment_url、出差 purpose/itinerary/note。
-- 修法：改以 SECURITY DEFINER function 只回「安全欄位」給行事曆，並移除過寬的 row policy。
-- ============================================================

-- ── 1. 公司行事曆：已核准請假（只回安全欄位，全員可用）──────────
CREATE OR REPLACE FUNCTION calendar_overview_leaves(p_from DATE, p_to DATE)
RETURNS TABLE (id UUID, start_date DATE, end_date DATE, display_name TEXT, leave_type_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lr.id, lr.start_date, lr.end_date, u.display_name, lt.name_zh
  FROM leave_requests lr
  JOIN users u ON u.id = lr.user_id
  LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
  WHERE lr.status = 'approved'
    AND lr.start_date < p_to
    AND lr.end_date >= p_from
$$;

-- ── 2. 公司行事曆：已核准出差（只回安全欄位）──────────────────
CREATE OR REPLACE FUNCTION calendar_overview_trips(p_from DATE, p_to DATE)
RETURNS TABLE (id UUID, start_date DATE, end_date DATE, display_name TEXT, destination TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bt.id, bt.start_date, bt.end_date, u.display_name, bt.destination
  FROM business_trips bt
  JOIN users u ON u.id = bt.user_id
  WHERE bt.status = 'approved'
    AND bt.start_date < p_to
    AND bt.end_date >= p_from
$$;

-- ── 3. 請假行事曆（/leave/calendar）：部門範圍內的請假 ─────────
-- HR/admin 可見全部；一般員工僅見同部門。含 reason（維持原團隊行事曆行為），
-- 但將「跨部門全員可讀」收斂為「同部門」，關閉直打 PostgREST 的跨部門洩漏。
CREATE OR REPLACE FUNCTION calendar_dept_leaves(p_from DATE, p_to DATE)
RETURNS TABLE (
  id UUID, user_id UUID, leave_type_id UUID, start_date DATE, end_date DATE,
  status TEXT, reason TEXT, display_name TEXT, department_id UUID, leave_type_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lr.id, lr.user_id, lr.leave_type_id, lr.start_date, lr.end_date,
         lr.status, lr.reason, u.display_name, u.department_id, lt.name_zh
  FROM leave_requests lr
  JOIN users u ON u.id = lr.user_id
  LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
  WHERE lr.status IN ('approved', 'pending')
    AND lr.start_date <= p_to
    AND lr.end_date >= p_from
    AND (
      is_admin() OR has_feature('hr_manager')
      OR u.department_id = (SELECT department_id FROM users WHERE id = auth.uid())
    )
$$;

GRANT EXECUTE ON FUNCTION calendar_overview_leaves(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calendar_overview_trips(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calendar_dept_leaves(DATE, DATE) TO authenticated;

-- ── 4. 移除過寬的 row policy（洩漏來源）───────────────────────
-- 基礎 SELECT policy（本人/主管/hr/admin）仍在，請假/出差/簽核等模組不受影響；
-- 行事曆改走上述 function。
DROP POLICY IF EXISTS "leave_requests: approved visible to all" ON leave_requests;
DROP POLICY IF EXISTS "business_trips: approved visible to all" ON business_trips;
