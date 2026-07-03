-- ============================================================
-- myOPS — 員工報帳（費用報銷）模組
-- 員工代墊費用申請 → 審批（expense_approve）→ 撥付
-- ============================================================

CREATE TABLE IF NOT EXISTS expense_claims (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expense_date  DATE NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('transport', 'travel', 'meal', 'supplies', 'other')),
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency      TEXT NOT NULL DEFAULT 'TWD',
  description   TEXT NOT NULL,
  receipt_paths TEXT[] NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  paid_at       TIMESTAMPTZ,
  paid_by       UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_claims_user   ON expense_claims(user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON expense_claims(status);

ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;

-- 本人可看自己的；審批者（expense_approve）與 admin 可看全部
DROP POLICY IF EXISTS expense_claims_select ON expense_claims;
CREATE POLICY expense_claims_select
  ON expense_claims FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR has_feature('expense_approve'));

-- 只能以自己的名義申請
DROP POLICY IF EXISTS expense_claims_insert ON expense_claims;
CREATE POLICY expense_claims_insert
  ON expense_claims FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 本人僅能改 pending 中的申請（編輯/取消）
DROP POLICY IF EXISTS expense_claims_own_update ON expense_claims;
CREATE POLICY expense_claims_own_update
  ON expense_claims FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

-- 審批者可更新（核准/退回/撥付）
DROP POLICY IF EXISTS expense_claims_approver_update ON expense_claims;
CREATE POLICY expense_claims_approver_update
  ON expense_claims FOR UPDATE TO authenticated
  USING (is_admin() OR has_feature('expense_approve'));

-- 本人可刪除 pending 中的申請
DROP POLICY IF EXISTS expense_claims_delete ON expense_claims;
CREATE POLICY expense_claims_delete
  ON expense_claims FOR DELETE TO authenticated
  USING ((user_id = auth.uid() AND status = 'pending') OR is_admin());

-- updated_at trigger（set_updated_at() 已存在）
DROP TRIGGER IF EXISTS set_updated_at ON expense_claims;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON expense_claims
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Feature flag（預設關閉，admin 於 /admin/settings 開啟）
INSERT INTO system_settings (key, value)
VALUES ('feature.expenses', 'false')
ON CONFLICT (key) DO NOTHING;

-- 發票收據 bucket（10MB，影像 + PDF）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('expense-receipts', 'expense-receipts', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "expense-receipts bucket: authenticated can upload" ON storage.objects;
CREATE POLICY "expense-receipts bucket: authenticated can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts');

DROP POLICY IF EXISTS "expense-receipts bucket: authenticated can read" ON storage.objects;
CREATE POLICY "expense-receipts bucket: authenticated can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts');
