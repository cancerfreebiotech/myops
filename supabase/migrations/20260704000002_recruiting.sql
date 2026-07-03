-- ============================================================
-- myOPS — 招募管理（ATS Lite）
-- 職缺 / 應徵者 / 面試記錄；admin 或 hr_manager 管理
-- ============================================================

CREATE TABLE IF NOT EXISTS job_openings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  department_id UUID REFERENCES departments(id),
  description   TEXT,
  requirements  TEXT,
  headcount     INT NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paused', 'closed')),
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS candidates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id   UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  source       TEXT NOT NULL DEFAULT 'other'
               CHECK (source IN ('referral', 'job_board', 'linkedin', 'agency', 'other')),
  stage        TEXT NOT NULL DEFAULT 'applied'
               CHECK (stage IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  resume_paths TEXT[] NOT NULL DEFAULT '{}',
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_opening ON candidates(opening_id, stage);

CREATE TABLE IF NOT EXISTS interview_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  interviewer_id UUID REFERENCES users(id),
  interview_date DATE NOT NULL,
  rating         INT CHECK (rating BETWEEN 1 AND 5),
  feedback       TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_notes_candidate ON interview_notes(candidate_id);

ALTER TABLE job_openings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_notes ENABLE ROW LEVEL SECURITY;

-- 招募資料屬敏感個資：僅 admin / hr_manager
DROP POLICY IF EXISTS job_openings_manage ON job_openings;
CREATE POLICY job_openings_manage
  ON job_openings FOR ALL TO authenticated
  USING (is_admin() OR has_feature('hr_manager'))
  WITH CHECK (is_admin() OR has_feature('hr_manager'));

DROP POLICY IF EXISTS candidates_manage ON candidates;
CREATE POLICY candidates_manage
  ON candidates FOR ALL TO authenticated
  USING (is_admin() OR has_feature('hr_manager'))
  WITH CHECK (is_admin() OR has_feature('hr_manager'));

DROP POLICY IF EXISTS interview_notes_manage ON interview_notes;
CREATE POLICY interview_notes_manage
  ON interview_notes FOR ALL TO authenticated
  USING (is_admin() OR has_feature('hr_manager'))
  WITH CHECK (is_admin() OR has_feature('hr_manager'));

DROP TRIGGER IF EXISTS set_updated_at ON job_openings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON job_openings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON candidates;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 履歷 bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recruiting-files', 'recruiting-files', false, 10485760,
        ARRAY['application/pdf', 'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "recruiting-files bucket: authenticated can upload" ON storage.objects;
CREATE POLICY "recruiting-files bucket: authenticated can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recruiting-files');

DROP POLICY IF EXISTS "recruiting-files bucket: authenticated can read" ON storage.objects;
CREATE POLICY "recruiting-files bucket: authenticated can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recruiting-files');

INSERT INTO system_settings (key, value)
VALUES ('feature.recruiting', 'false')
ON CONFLICT (key) DO NOTHING;
