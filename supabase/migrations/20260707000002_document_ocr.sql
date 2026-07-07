-- ============================================================
-- myOPS — F1 文件 OCR 全文搜尋
-- 純檔案文件（僅 file_url）經可設定的 OCR/AI endpoint 抽文字存 ocr_text，供全文搜尋。
-- ============================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_text TEXT;

-- OCR endpoint 設定（沿用 system_settings；admin 於 /admin/settings 設定）
INSERT INTO system_settings (key, value) VALUES
  ('ocr_api_url', ''),
  ('ocr_api_key', '')
ON CONFLICT (key) DO NOTHING;

-- audit_logs.action 加入 'ocr'
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN ('upload','approve','reject','confirm','archive','restore','download','ai_translate','remind','ocr'));
