-- ============================================================
-- myOPS — 收緊 document_recipients「self update own」policy 的可改欄位
-- 問題：self update own 允許收件人更新自己整列，可竄改 requires_confirmation /
--   reminder_days 規避提醒義務、或改 last_reminded_at。
-- 修法：guard trigger — 非 admin/publish_announcement 者只能變更 confirmed_at。
-- ============================================================

CREATE OR REPLACE FUNCTION document_recipients_self_update_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_admin() OR has_feature('publish_announcement') THEN
    RETURN NEW;  -- 發布者/管理員走 publisher manage policy，不受限
  END IF;
  IF NEW.requires_confirmation IS DISTINCT FROM OLD.requires_confirmation
     OR NEW.reminder_days   IS DISTINCT FROM OLD.reminder_days
     OR NEW.last_reminded_at IS DISTINCT FROM OLD.last_reminded_at
     OR NEW.document_id      IS DISTINCT FROM OLD.document_id
     OR NEW.user_id          IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'forbidden: recipients may only confirm their own row';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_recipients_self_update_guard ON document_recipients;
CREATE TRIGGER document_recipients_self_update_guard
  BEFORE UPDATE ON document_recipients
  FOR EACH ROW EXECUTE FUNCTION document_recipients_self_update_guard();
