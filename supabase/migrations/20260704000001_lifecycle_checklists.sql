-- ============================================================
-- myOPS — 入職/離職 Checklist
-- admin / hr_manager 為員工建立流程清單，逐項勾選追蹤
-- ============================================================

CREATE TABLE IF NOT EXISTS lifecycle_checklists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('onboarding', 'offboarding')),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_checklists_user ON lifecycle_checklists(user_id, kind);

CREATE TABLE IF NOT EXISTS lifecycle_checklist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES lifecycle_checklists(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'other'
               CHECK (category IN ('account', 'equipment', 'access', 'handover', 'hr', 'other')),
  done         BOOLEAN NOT NULL DEFAULT FALSE,
  done_by      UUID REFERENCES users(id),
  done_at      TIMESTAMPTZ,
  note         TEXT,
  sort_order   INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_items_checklist ON lifecycle_checklist_items(checklist_id, sort_order);

ALTER TABLE lifecycle_checklists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_checklist_items ENABLE ROW LEVEL SECURITY;

-- admin / hr_manager 全權
DROP POLICY IF EXISTS lifecycle_checklists_manage ON lifecycle_checklists;
CREATE POLICY lifecycle_checklists_manage
  ON lifecycle_checklists FOR ALL TO authenticated
  USING (is_admin() OR has_feature('hr_manager'))
  WITH CHECK (is_admin() OR has_feature('hr_manager'));

DROP POLICY IF EXISTS lifecycle_items_manage ON lifecycle_checklist_items;
CREATE POLICY lifecycle_items_manage
  ON lifecycle_checklist_items FOR ALL TO authenticated
  USING (is_admin() OR has_feature('hr_manager'))
  WITH CHECK (is_admin() OR has_feature('hr_manager'));

DROP TRIGGER IF EXISTS set_updated_at ON lifecycle_checklists;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON lifecycle_checklists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Feature flag（預設關閉）
INSERT INTO system_settings (key, value)
VALUES ('feature.lifecycle', 'false')
ON CONFLICT (key) DO NOTHING;
