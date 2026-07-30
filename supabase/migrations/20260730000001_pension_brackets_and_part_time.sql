-- 勞退月提繳工資分級表 + 勞健保級距支援「部分工時」（Linda 7/30 回報 774a2ea3）
--
-- 設計方向與原因：
--
-- 1. 部分工時級距（grade_label）
--    官方勞保投保薪資分級表在第 1 級之前另有「部分工時」數級（11,100~28,590），
--    那幾列的「等級」欄是文字而不是數字。匯入程式把非數字的等級當成 0 再用 grade > 0
--    濾掉，於是 17 列被**靜默丟棄**（Linda 上傳 75 列、實際只進 58 列，且畫面沒有任何提示）。
--    修法是加 grade_label：級別的顯示文字（'部分工時'）與排序用的數字分開存，
--    部分工時列 grade 存 0、grade_label 存原始文字。查級距只看 insured_salary，
--    所以 grade 是否為 0 不影響計算；(effective_year, grade) 本來就沒有唯一約束，
--    多列 grade=0 不衝突。
--
-- 2. 勞退分級表（pension_wage_brackets）
--    原本勞退提繳是「月薪 × 6%」直接算，沒有走法定的「勞工退休金月提繳工資分級表」，
--    金額會與申報值不同（例如實際工資 30,000 的月提繳工資應為 30,300）。
--    本表以「月提繳工資」為級距上限，與勞健保表同樣的查法（取第一個 >= 實際工資者），
--    所以計算端可以共用同一個 findBracket 邏輯。
--    wage_floor / wage_ceiling 只為顯示與核對用（ceiling 為 NULL 代表最高級「以上」）。
--
--    種子資料來源：勞動部勞工保險局「勞工退休金月提繳分級表」
--    （中華民國 114 年 11 月 24 日勞動部勞動福 3 字第 1140153598 號令修正發布，
--     自 115 年 1 月 1 日生效；PDF: https://www.bli.gov.tw/Files/25709）
--    62 級全數由該 PDF 解析後寫入，並已程式驗證：級別連續 1~62、月提繳工資嚴格遞增、
--    每級的月提繳工資等於該級實際工資區間上限、區間首尾相接（下限＝前一級上限＋1）。

-- ── 1. 部分工時級距 ─────────────────────────────────────────
ALTER TABLE labor_insurance_brackets  ADD COLUMN IF NOT EXISTS grade_label TEXT;
ALTER TABLE health_insurance_brackets ADD COLUMN IF NOT EXISTS grade_label TEXT;

COMMENT ON COLUMN labor_insurance_brackets.grade_label IS
  '級別顯示文字；官方表中「部分工時」等非數字級別存於此，grade 則存 0';
COMMENT ON COLUMN health_insurance_brackets.grade_label IS
  '級別顯示文字；官方表中「部分工時」等非數字級別存於此，grade 則存 0';

-- ── 1b. 匯入 RPC 一併接受部分工時列與 grade_label ───────────
-- 原本的每列檢查是 grade > 0，部分工時列（grade=0、grade_label='部分工時'）會被擋成
-- invalid_row。改為「投保薪資必須為正」＝真正的必要條件；等級為 0 時要求有 grade_label，
-- 避免真的空白列被當成合法級距寫進去。
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

  -- employee_share / employer_share 仍刻意不 COALESCE：那兩欄 NOT NULL，缺 key 就讓它
  -- 撞 NOT NULL 直接失敗，不要靜靜寫成 0——那會變成「整年度保費 0 元」的無聲錯誤。
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) r
     WHERE COALESCE((r->>'insured_salary')::numeric, 0) <= 0
        OR (COALESCE((r->>'grade')::numeric, 0) <= 0
            AND COALESCE(NULLIF(TRIM(r->>'grade_label'), ''), '') = '')
  ) THEN
    RAISE EXCEPTION 'invalid_row' USING ERRCODE = 'P0101';
  END IF;

  IF p_kind = 'labor' THEN
    DELETE FROM labor_insurance_brackets WHERE effective_year = p_year;

    INSERT INTO labor_insurance_brackets (
      effective_year, grade, grade_label, insured_salary, employee_share, employer_share, uploaded_by
    )
    SELECT p_year,
           COALESCE((r->>'grade')::numeric::integer, 0),
           NULLIF(TRIM(COALESCE(r->>'grade_label', '')), ''),
           (r->>'insured_salary')::numeric,
           (r->>'employee_share')::numeric,
           (r->>'employer_share')::numeric,
           p_uploaded_by
      FROM jsonb_array_elements(p_rows) r;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  ELSE
    DELETE FROM health_insurance_brackets WHERE effective_year = p_year;

    INSERT INTO health_insurance_brackets (
      effective_year, grade, grade_label, insured_salary, employee_share, employee_dependents,
      employer_share, uploaded_by
    )
    SELECT p_year,
           COALESCE((r->>'grade')::numeric::integer, 0),
           NULLIF(TRIM(COALESCE(r->>'grade_label', '')), ''),
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

-- CREATE OR REPLACE 不會重置既有授權，但明確再收一次比較保險
-- （若日後有人 DROP 後重建，預設授權會回到 anon/authenticated）。
REVOKE ALL ON FUNCTION replace_insurance_brackets(text, integer, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_insurance_brackets(text, integer, jsonb, uuid)
  TO service_role;

-- ── 2. 勞退月提繳工資分級表 ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pension_wage_brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_year INTEGER NOT NULL,
  grade INTEGER NOT NULL,
  grade_label TEXT,
  /** 實際工資區間（含）；ceiling 為 NULL＝最高級「以上」 */
  wage_floor NUMERIC NOT NULL,
  wage_ceiling NUMERIC,
  /** 月提繳工資：申報與 6% 提繳的計算基礎 */
  contribution_wage NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pension_wage_brackets_year
  ON pension_wage_brackets (effective_year, contribution_wage);

COMMENT ON TABLE pension_wage_brackets IS
  '勞工退休金月提繳工資分級表（勞退條例 §14）。查法：取 contribution_wage >= 實際工資的最低一級';

ALTER TABLE pension_wage_brackets ENABLE ROW LEVEL SECURITY;

-- 權限與勞健保級距表一致：人資／財務／管理員可讀，財務／管理員可寫
DROP POLICY IF EXISTS "pension_wage_brackets: hr/finance/admin can read" ON pension_wage_brackets;
CREATE POLICY "pension_wage_brackets: hr/finance/admin can read" ON pension_wage_brackets
  FOR SELECT TO authenticated
  USING (has_feature('hr_manager') OR has_feature('finance_payroll') OR is_admin());

DROP POLICY IF EXISTS "pension_wage_brackets: finance/admin can write" ON pension_wage_brackets;
CREATE POLICY "pension_wage_brackets: finance/admin can write" ON pension_wage_brackets
  FOR ALL TO authenticated
  USING (has_feature('finance_payroll') OR is_admin())
  WITH CHECK (has_feature('finance_payroll') OR is_admin());

-- ── 2b. 整年度原子替換（與勞健保級距同樣的理由）─────────────
-- 分兩趟 DELETE + INSERT 的話，中途失敗會讓同年度同時存在新舊兩套級距，
-- 之後每張薪資單的勞退提繳都會抓到錯的那筆而且不會報錯（v0.9.9 修過同款問題）。
CREATE OR REPLACE FUNCTION replace_pension_brackets(
  p_year        integer,
  p_rows        jsonb,
  p_uploaded_by uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2999 THEN
    RAISE EXCEPTION 'invalid_year' USING ERRCODE = 'P0101';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'empty_rows' USING ERRCODE = 'P0101';
  END IF;

  IF p_uploaded_by IS NULL OR NOT EXISTS (
    SELECT 1 FROM users u
     WHERE u.id = p_uploaded_by
       AND (u.role = 'admin' OR 'finance_payroll' = ANY(COALESCE(u.granted_features, '{}')))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0101';
  END IF;

  -- 月提繳工資是計算基礎，必須為正；wage_floor 缺值補 0（僅顯示用）
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) r
     WHERE COALESCE((r->>'contribution_wage')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'invalid_row' USING ERRCODE = 'P0101';
  END IF;

  DELETE FROM pension_wage_brackets WHERE effective_year = p_year;

  INSERT INTO pension_wage_brackets (
    effective_year, grade, grade_label, wage_floor, wage_ceiling, contribution_wage, uploaded_by
  )
  SELECT p_year,
         COALESCE((r->>'grade')::numeric::integer, 0),
         NULLIF(TRIM(COALESCE(r->>'grade_label', '')), ''),
         COALESCE((r->>'wage_floor')::numeric, 0),
         (r->>'wage_ceiling')::numeric,
         (r->>'contribution_wage')::numeric,
         p_uploaded_by
    FROM jsonb_array_elements(p_rows) r;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- 繞 RLS 且會整年度砍資料 → 只留 service_role（Supabase 預設會 GRANT 給 anon/authenticated）
REVOKE ALL ON FUNCTION replace_pension_brackets(integer, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_pension_brackets(integer, jsonb, uuid) TO service_role;

-- ── 3. 種子：115/1/1 生效版（民國年 115 = 西元 2026）────────
-- 重跑安全：先清掉同年度既有資料再寫入（金額若有修正公告，重跑即可覆蓋）
DELETE FROM pension_wage_brackets WHERE effective_year = 2026;

INSERT INTO pension_wage_brackets (effective_year, grade, wage_floor, wage_ceiling, contribution_wage) VALUES
  (2026, 1, 0, 1500, 1500),
  (2026, 2, 1501, 3000, 3000),
  (2026, 3, 3001, 4500, 4500),
  (2026, 4, 4501, 6000, 6000),
  (2026, 5, 6001, 7500, 7500),
  (2026, 6, 7501, 8700, 8700),
  (2026, 7, 8701, 9900, 9900),
  (2026, 8, 9901, 11100, 11100),
  (2026, 9, 11101, 12540, 12540),
  (2026, 10, 12541, 13500, 13500),
  (2026, 11, 13501, 15840, 15840),
  (2026, 12, 15841, 16500, 16500),
  (2026, 13, 16501, 17280, 17280),
  (2026, 14, 17281, 17880, 17880),
  (2026, 15, 17881, 19047, 19047),
  (2026, 16, 19048, 20008, 20008),
  (2026, 17, 20009, 21009, 21009),
  (2026, 18, 21010, 22000, 22000),
  (2026, 19, 22001, 23100, 23100),
  (2026, 20, 23101, 24000, 24000),
  (2026, 21, 24001, 25250, 25250),
  (2026, 22, 25251, 26400, 26400),
  (2026, 23, 26401, 27600, 27600),
  (2026, 24, 27601, 28590, 28590),
  (2026, 25, 28591, 29500, 29500),
  (2026, 26, 29501, 30300, 30300),
  (2026, 27, 30301, 31800, 31800),
  (2026, 28, 31801, 33300, 33300),
  (2026, 29, 33301, 34800, 34800),
  (2026, 30, 34801, 36300, 36300),
  (2026, 31, 36301, 38200, 38200),
  (2026, 32, 38201, 40100, 40100),
  (2026, 33, 40101, 42000, 42000),
  (2026, 34, 42001, 43900, 43900),
  (2026, 35, 43901, 45800, 45800),
  (2026, 36, 45801, 48200, 48200),
  (2026, 37, 48201, 50600, 50600),
  (2026, 38, 50601, 53000, 53000),
  (2026, 39, 53001, 55400, 55400),
  (2026, 40, 55401, 57800, 57800),
  (2026, 41, 57801, 60800, 60800),
  (2026, 42, 60801, 63800, 63800),
  (2026, 43, 63801, 66800, 66800),
  (2026, 44, 66801, 69800, 69800),
  (2026, 45, 69801, 72800, 72800),
  (2026, 46, 72801, 76500, 76500),
  (2026, 47, 76501, 80200, 80200),
  (2026, 48, 80201, 83900, 83900),
  (2026, 49, 83901, 87600, 87600),
  (2026, 50, 87601, 92100, 92100),
  (2026, 51, 92101, 96600, 96600),
  (2026, 52, 96601, 101100, 101100),
  (2026, 53, 101101, 105600, 105600),
  (2026, 54, 105601, 110100, 110100),
  (2026, 55, 110101, 115500, 115500),
  (2026, 56, 115501, 120900, 120900),
  (2026, 57, 120901, 126300, 126300),
  (2026, 58, 126301, 131700, 131700),
  (2026, 59, 131701, 137100, 137100),
  (2026, 60, 137101, 142500, 142500),
  (2026, 61, 142501, 147900, 147900),
  (2026, 62, 147901, NULL, 150000);
