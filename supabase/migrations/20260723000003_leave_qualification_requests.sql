-- ============================================================
-- myOPS — 特殊假別線上資格申請（回報4）
-- 在既有「requires_qualification 旗標 + 送單阻擋 + qualifiedTypeIds 解鎖」原型之上，
-- 補上線上申請層：員工提出特殊假資格申請（下拉假別 + 原因 + 多檔附件）→ HR 審核
-- （核准時核給天數＝寫入 leave_balances，既有送單阻擋即自動解鎖）。
-- 沿用 house pattern：owner-RLS 讀寫申請；核准為 SECURITY DEFINER 原子 RPC
-- （職責分離 + compare-and-swap + 授權），附件走新 private bucket 'leave-files'。
-- ============================================================

CREATE TABLE IF NOT EXISTS leave_qualification_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  reason        TEXT NOT NULL,
  attachments   TEXT[] NOT NULL DEFAULT '{}',          -- storage 路徑陣列（bucket: leave-files；比照 resume_paths/attachment_paths 慣例）
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  hr_note       TEXT,
  granted_days  NUMERIC(5,1),
  reviewer_id   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_qual_status ON leave_qualification_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_qual_user   ON leave_qualification_requests(user_id, created_at);

ALTER TABLE leave_qualification_requests ENABLE ROW LEVEL SECURITY;

-- 本人可讀自己的申請
DROP POLICY IF EXISTS "leave_qual: owner select" ON leave_qualification_requests;
CREATE POLICY "leave_qual: owner select" ON leave_qualification_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 本人可建立自己的申請（user_id 必須為自己）
DROP POLICY IF EXISTS "leave_qual: owner insert" ON leave_qualification_requests;
CREATE POLICY "leave_qual: owner insert" ON leave_qualification_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- HR（admin 或具 hr_manager 權限）可讀/管理全部（審核 UPDATE 實際走下方 SECURITY DEFINER RPC）
DROP POLICY IF EXISTS "leave_qual: hr manage" ON leave_qualification_requests;
CREATE POLICY "leave_qual: hr manage" ON leave_qualification_requests
  FOR ALL TO authenticated
  USING (is_admin() OR has_feature('hr_manager'))
  WITH CHECK (is_admin() OR has_feature('hr_manager'));

GRANT SELECT, INSERT ON leave_qualification_requests TO authenticated;

-- 附件 bucket（private，比照 recruiting-files 20260704000002）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('leave-files', 'leave-files', false, 10485760,
  ARRAY['application/pdf','image/jpeg','image/png','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "leave-files bucket: authenticated can upload" ON storage.objects;
CREATE POLICY "leave-files bucket: authenticated can upload"
  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'leave-files');
DROP POLICY IF EXISTS "leave-files bucket: authenticated can read" ON storage.objects;
CREATE POLICY "leave-files bucket: authenticated can read"
  ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'leave-files');

-- 原子核准＋核給（比照 approve_makeup_request 20260703000002）：
-- 職責分離（審核者≠申請人）+ compare-and-swap（僅 pending 可審）+ 核准時 upsert leave_balances。
CREATE OR REPLACE FUNCTION approve_leave_qualification(
  p_id uuid, p_approve boolean, p_granted_days numeric DEFAULT NULL,
  p_hr_note text DEFAULT NULL, p_year int DEFAULT NULL)
RETURNS leave_qualification_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE req leave_qualification_requests;
BEGIN
  SELECT * INTO req FROM leave_qualification_requests WHERE id = p_id FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (is_admin() OR has_feature('hr_manager')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF req.user_id = auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;      -- 職責分離
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'already_processed'; END IF; -- compare-and-swap

  IF p_approve THEN
    IF p_granted_days IS NULL OR p_granted_days <= 0 THEN RAISE EXCEPTION 'invalid_grant_days'; END IF;
    UPDATE leave_qualification_requests
       SET status='approved', granted_days=p_granted_days, hr_note=p_hr_note,
           reviewer_id=auth.uid(), reviewed_at=now()
     WHERE id=p_id RETURNING * INTO req;
    INSERT INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, source, updated_by)
    VALUES (req.user_id, req.leave_type_id,
            COALESCE(p_year, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Taipei'))::int),
            p_granted_days, 0, 'manual', auth.uid())
    ON CONFLICT (user_id, leave_type_id, year)
    DO UPDATE SET total_days = EXCLUDED.total_days, source = 'manual', updated_by = EXCLUDED.updated_by;  -- 保留既有 used_days
  ELSE
    UPDATE leave_qualification_requests
       SET status='rejected', hr_note=p_hr_note, reviewer_id=auth.uid(), reviewed_at=now()
     WHERE id=p_id RETURNING * INTO req;
  END IF;
  RETURN req;
END;
$$;

REVOKE ALL ON FUNCTION approve_leave_qualification(uuid, boolean, numeric, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_leave_qualification(uuid, boolean, numeric, text, int) TO authenticated, service_role;
