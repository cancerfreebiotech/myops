-- ============================================================
-- myOPS — 教育訓練與證照管理
-- 課程/訓練記錄/證照 + 到期追蹤
-- 檢視：本人（manage 全覽）；管理：admin 或 training_manage
-- ============================================================

CREATE TABLE IF NOT EXISTS training_courses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'general'
                  CHECK (category IN ('gcp', 'biosafety', 'radiation', 'quality', 'general')),
  description     TEXT,
  material_doc_id UUID REFERENCES documents(id),
  material_url    TEXT,
  hours           NUMERIC(5,1) NOT NULL DEFAULT 0,
  is_required     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS training_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed')),
  assigned_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  hours            NUMERIC(5,1),
  note             TEXT,
  attachment_paths TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE(course_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_training_records_user ON training_records(user_id, status);

CREATE TABLE IF NOT EXISTS certifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  issuer           TEXT,
  cert_no          TEXT,
  issued_date      DATE,
  expiry_date      DATE,
  attachment_paths TEXT[] NOT NULL DEFAULT '{}',
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_certifications_user   ON certifications(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certifications_expiry ON certifications(expiry_date) WHERE deleted_at IS NULL;

ALTER TABLE training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications   ENABLE ROW LEVEL SECURITY;

-- ── 課程：全員可讀，管理者可寫 ───────────────────────────────
DROP POLICY IF EXISTS training_courses_select ON training_courses;
CREATE POLICY training_courses_select
  ON training_courses FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR is_admin() OR has_feature('training_manage'));

DROP POLICY IF EXISTS training_courses_write ON training_courses;
CREATE POLICY training_courses_write
  ON training_courses FOR ALL TO authenticated
  USING (is_admin() OR has_feature('training_manage'))
  WITH CHECK (is_admin() OR has_feature('training_manage'));

-- ── 訓練記錄：本人可讀＋標記完成；管理者全權 ─────────────────
DROP POLICY IF EXISTS training_records_select ON training_records;
CREATE POLICY training_records_select
  ON training_records FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR has_feature('training_manage'));

DROP POLICY IF EXISTS training_records_self_update ON training_records;
CREATE POLICY training_records_self_update
  ON training_records FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS training_records_manage_all ON training_records;
CREATE POLICY training_records_manage_all
  ON training_records FOR ALL TO authenticated
  USING (is_admin() OR has_feature('training_manage'))
  WITH CHECK (is_admin() OR has_feature('training_manage'));

-- ── 證照：本人可讀寫自己的；管理者全權 ───────────────────────
DROP POLICY IF EXISTS certifications_select ON certifications;
CREATE POLICY certifications_select
  ON certifications FOR SELECT TO authenticated
  USING ((user_id = auth.uid() AND deleted_at IS NULL) OR is_admin() OR has_feature('training_manage'));

DROP POLICY IF EXISTS certifications_self_insert ON certifications;
CREATE POLICY certifications_self_insert
  ON certifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin() OR has_feature('training_manage'));

DROP POLICY IF EXISTS certifications_self_update ON certifications;
CREATE POLICY certifications_self_update
  ON certifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR has_feature('training_manage'));

DROP POLICY IF EXISTS certifications_manage_delete ON certifications;
CREATE POLICY certifications_manage_delete
  ON certifications FOR DELETE TO authenticated
  USING (is_admin() OR has_feature('training_manage'));

DROP TRIGGER IF EXISTS set_updated_at ON training_courses;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON training_courses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON certifications;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON certifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 附件 bucket（結業證明/證照掃描）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('training-files', 'training-files', false, 20971520,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "training-files bucket: authenticated can upload" ON storage.objects;
CREATE POLICY "training-files bucket: authenticated can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'training-files');

DROP POLICY IF EXISTS "training-files bucket: authenticated can read" ON storage.objects;
CREATE POLICY "training-files bucket: authenticated can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'training-files');

-- Feature flag（預設關閉）
INSERT INTO system_settings (key, value)
VALUES ('feature.training', 'false')
ON CONFLICT (key) DO NOTHING;
