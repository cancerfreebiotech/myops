-- ============================================================
-- myOPS — 修復公告閱讀確認子系統 schema drift + B6 提醒頻率
-- 問題：publish/confirm/daily-digest 程式使用 document_recipients 的
--   requires_confirmation / reminder_days / confirmed_at 欄位，但線上表只有
--   (document_id, user_id, last_reminded_at)，且無 INSERT/UPDATE RLS policy，
--   導致「發布公告並指定需確認收件人」「確認閱讀」「每日提醒」全部 400（0 筆資料）。
-- 修法：補齊程式預期的欄位與 RLS，並加 B6 頻率控制所需的索引。
-- ============================================================

ALTER TABLE document_recipients ADD COLUMN IF NOT EXISTS requires_confirmation BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE document_recipients ADD COLUMN IF NOT EXISTS reminder_days INTEGER;
ALTER TABLE document_recipients ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE document_recipients ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;
ALTER TABLE document_recipients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 發布者（admin / publish_announcement）可建立收件人、讀取全部（報表/催人/匯出）、管理
DROP POLICY IF EXISTS "document_recipients: publisher manage" ON document_recipients;
CREATE POLICY "document_recipients: publisher manage"
  ON document_recipients FOR ALL TO authenticated
  USING (is_admin() OR has_feature('publish_announcement'))
  WITH CHECK (is_admin() OR has_feature('publish_announcement'));

-- 收件人本人可確認自己的收件列（更新 confirmed_at）；既有 SELECT 「self can read own」保留
DROP POLICY IF EXISTS "document_recipients: self update own" ON document_recipients;
CREATE POLICY "document_recipients: self update own"
  ON document_recipients FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- B6：加速 digest 掃描「需確認且未確認」的收件人列
CREATE INDEX IF NOT EXISTS idx_document_recipients_pending_reminder
  ON document_recipients (user_id)
  WHERE requires_confirmation = TRUE AND confirmed_at IS NULL;
