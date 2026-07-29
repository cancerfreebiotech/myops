-- ============================================================
-- myOPS — 薪資模組：簽核軌跡欄位 + 保險級距原子上傳
-- （2026-07-23 稽核 CONFIRMED 項目 (a)(b)）
--
-- (a) payroll_records 原本只有 hr_reviewed_by/at、finance_confirmed_by/at、
--     coo_approved_by/at 六個欄位，卻完全沒有人在寫；而 API 早就在寫 paid_at，
--     但那個欄位從來沒被建立過 —— 正式庫實測確認不存在，所以「確認發放」
--     這一步每次都被 PostgREST 以 PGRST204 擋掉（薪資流程根本走不到 paid）。
--     這裡補上 paid_at / paid_by，並一併補 rejected_at / rejected_by
--     （退回也是同一支 API 的狀態轉移，沒有紀錄就等於缺一半軌跡）。
--
-- (b) 保險級距（勞保／健保）上傳原本是「先 insert 新列、再 delete 舊列」兩趟
--     PostgREST 呼叫，沒有交易保護：delete 那趟失敗或 serverless 中途被中斷，
--     該年度就同時留著新舊兩套級距，之後 findBracket() 會撈到重複／錯誤的級距，
--     直接算錯保費。改為單一 SECURITY DEFINER 函式，在同一個交易內
--     DELETE + INSERT，全有或全無。
--
-- 全檔 additive、可重複執行。
-- ============================================================

-- ── 1. 簽核／發放／退回的「誰、何時」欄位 ─────────────────────────────
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS paid_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id);

COMMENT ON COLUMN payroll_records.paid_at     IS '實際確認發放時間（action=pay）';
COMMENT ON COLUMN payroll_records.paid_by     IS '確認發放者（action=pay）';
COMMENT ON COLUMN payroll_records.rejected_at IS '退回時間（action=reject）';
COMMENT ON COLUMN payroll_records.rejected_by IS '退回者（action=reject）';

-- ── 2. 保險級距整年度替換（單一交易，原子） ───────────────────────────
-- p_kind 只接受 'labor' / 'health'，用靜態分支而非動態 SQL（無 SQL injection 面）。
-- 授權：函式只 GRANT service_role，呼叫端（/api/admin/insurance-brackets）已做
-- 「admin 或 granted_features 含 finance_payroll」檢查；此處再做一次同條件的
-- 防禦性檢查（讀 users.role / users.granted_features 這兩個一模一樣的欄位，
-- 所以不可能擋掉 route 已放行的呼叫者）。刻意不用 is_admin() / has_feature()：
-- 那兩支靠 auth.uid()，在 service_role 下為 NULL。
CREATE OR REPLACE FUNCTION replace_insurance_brackets(
  p_kind        text,
  p_year        integer,
  p_rows        jsonb,
  p_uploaded_by uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('labor', 'health') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = 'P0101';
  END IF;

  IF p_year IS NULL OR p_year < 2000 OR p_year > 2999 THEN
    RAISE EXCEPTION 'invalid_year' USING ERRCODE = 'P0101';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'empty_rows' USING ERRCODE = 'P0101';
  END IF;

  IF p_uploaded_by IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0101';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users u
     WHERE u.id = p_uploaded_by
       AND (u.role = 'admin' OR 'finance_payroll' = ANY(COALESCE(u.granted_features, '{}')))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0101';
  END IF;

  -- 每列必要欄位：等級與投保薪資必須為正數（與 route 端驗證同條件）。
  -- employee_share / employer_share 刻意不 COALESCE：那兩欄 NOT NULL，缺 key 就讓它
  -- 撞 NOT NULL 直接失敗（與舊版 PostgREST insert 行為一致），不要靜靜寫成 0——
  -- 那會變成「整年度保費 0 元」的無聲錯誤，之後每張薪資單都算錯。
  -- employee_dependents 可為 NULL，補 0 是明確選擇。
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) r
     WHERE COALESCE((r->>'grade')::numeric, 0) <= 0
        OR COALESCE((r->>'insured_salary')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'invalid_row' USING ERRCODE = 'P0101';
  END IF;

  IF p_kind = 'labor' THEN
    DELETE FROM labor_insurance_brackets WHERE effective_year = p_year;

    INSERT INTO labor_insurance_brackets (
      effective_year, grade, insured_salary, employee_share, employer_share, uploaded_by
    )
    SELECT p_year,
           (r->>'grade')::numeric::integer,
           (r->>'insured_salary')::numeric,
           (r->>'employee_share')::numeric,
           (r->>'employer_share')::numeric,
           p_uploaded_by
      FROM jsonb_array_elements(p_rows) r;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  ELSE
    DELETE FROM health_insurance_brackets WHERE effective_year = p_year;

    INSERT INTO health_insurance_brackets (
      effective_year, grade, insured_salary, employee_share, employee_dependents,
      employer_share, uploaded_by
    )
    SELECT p_year,
           (r->>'grade')::numeric::integer,
           (r->>'insured_salary')::numeric,
           (r->>'employee_share')::numeric,
           COALESCE((r->>'employee_dependents')::numeric, 0),
           (r->>'employer_share')::numeric,
           p_uploaded_by
      FROM jsonb_array_elements(p_rows) r;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN v_inserted;
END;
$$;

-- Supabase 對 public schema 的新函式會自動 GRANT 給 anon/authenticated —
-- 這支繞 RLS 且會整年度砍資料，必須明確收回，只留 service_role。
REVOKE ALL ON FUNCTION replace_insurance_brackets(text, integer, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_insurance_brackets(text, integer, jsonb, uuid)
  TO service_role;
