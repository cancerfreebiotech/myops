-- ============================================================
-- myOPS — 授權閘門改為 fail-closed（2026-07-29）
--
-- 【問題】is_admin() / has_feature() 寫成 `SELECT expr FROM users WHERE id = auth.uid()`，
-- 查不到列時回傳 NULL 而非 false。未登入（anon，auth.uid() 為 NULL）時：
--
--   IF NOT (is_admin() OR has_feature('hr_manager')) THEN RAISE EXCEPTION 'forbidden'; END IF;
--   -- NOT (NULL OR NULL) = NOT NULL = NULL
--   -- PL/pgSQL 的 `IF NULL THEN` 不進入分支 ⇒ RAISE 被跳過 ⇒ 閘門形同不存在
--
-- 關鍵區別：判定寫在 SQL `WHERE` 裡是安全的（NULL 不為真 → 濾掉，calendar_dept_leaves
-- 即是如此）；寫成 PL/pgSQL `IF NOT (...) THEN RAISE` 就 fail open。
--
-- 【修法】把兩支述詞包成 COALESCE(..., false)。RLS policy 行為零影響
-- （policy 的 USING/WITH_CHECK 本來就把 NULL 當不為真），但所有 PL/pgSQL
-- 閘門一次全部轉為 fail-closed。這是投入最小、覆蓋最廣的一擊，同時堵掉：
--   - approve_makeup_request / approve_leave_qualification 的職責分離檢查
--     （`IF req.user_id = auth.uid()` 在 anon 下同樣被跳過 ⇒ 可自我核准）
--   - approved_grs_for_asset（廠商名稱與金額）
--
-- 另修一個同類的邊界：granted_features 為 NULL 時 `feature = ANY(NULL)` 也是 NULL，
-- 代表「已登入但 granted_features 未設」的使用者同樣會讓閘門 fail open。改以
-- COALESCE(granted_features, '{}') 處理。
--
-- 【一併收斂 ACL】Supabase 對 public schema 的新函式有預設授權，會自動 GRANT 給
-- anon / authenticated，且 `REVOKE ... FROM PUBLIC` 收不掉，必須明確寫出角色。
-- ============================================================

-- ── 1. 兩支授權述詞改為 fail-closed ──────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM users WHERE id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION has_feature(feature TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((
    SELECT role = 'admin' OR feature = ANY(COALESCE(granted_features, '{}'::TEXT[]))
    FROM users WHERE id = auth.uid()
  ), false)
$$;

-- ── 2. next_doc_no：只給 service_role ────────────────────────
-- 它完全沒有授權檢查，程式碼註解本來就寫明「只授權 service_role」，實際 ACL 卻
-- 給了 anon/authenticated ⇒ 未登入者可任意遞增 doc_counters 造成單號跳號、
-- 稽核序號不連續，也能塞垃圾 doc_type。
--
-- 安全性確認（已對正式庫查核）：帶 set_procurement_doc_no BEFORE INSERT trigger 的
-- 10 張表（rfqs / purchase_requests / goods_receipts / inbound_orders /
-- outbound_orders / deposit_requests / ap_requests / installment_requests /
-- vendor_evaluations / product_evaluations）對 authenticated 都沒有 INSERT/ALL
-- policy，且該 trigger 非 SECURITY DEFINER —— 也就是說 authenticated 身分本來就
-- 無法 INSERT 這些表、不可能觸發 trigger 內的 next_doc_no()。應用層一律以
-- service role 寫入（procurementWriteClient / SECURITY DEFINER RPC），故收權不影響任何合法路徑。
REVOKE ALL ON FUNCTION next_doc_no(p_doc_type TEXT, p_prefix TEXT) FROM PUBLIC, anon, authenticated;

-- ── 3. 公司行事曆／資產查詢函式：移除 anon ───────────────────
-- 這三支的原始 migration 只寫了 GRANT ... TO authenticated（本意就是僅限登入者），
-- anon 是 Supabase 預設授權自動加上去的。此處明確 REVOKE，作為 COALESCE 之外的
-- 第二層防線（defense in depth）：即使日後有人再寫出 fail-open 的閘門，未登入
-- 也連函式都執行不到。
REVOKE ALL ON FUNCTION calendar_overview_leaves(DATE, DATE) FROM anon;
REVOKE ALL ON FUNCTION calendar_overview_trips(DATE, DATE) FROM anon;
REVOKE ALL ON FUNCTION approved_grs_for_asset() FROM anon;
