-- ============================================================
-- myOPS — B4 公告一鍵催人
-- documents.last_reminded_at 做冷卻（防濫發）；audit_logs.action 加 'remind'
-- ============================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN ('upload','approve','reject','confirm','archive','restore','download','ai_translate','remind'));
