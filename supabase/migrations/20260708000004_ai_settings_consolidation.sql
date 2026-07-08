-- ============================================================
-- myOPS — AI 設定整併（消除混淆）
-- 1) 舊 gemini_api_key 的值搬到 ai_api_key（若後者為空），然後刪除舊列
-- 2) 刪除 ocr_api_url / ocr_api_key：OCR 改用「AI 連線」的視覺模型，無獨立 OCR 服務
-- 3) 新增 ai_last_test：測試連線按鈕的結果（JSON：ok/model/ms/error/at），設定頁顯示用
-- ============================================================

UPDATE system_settings
SET value = (SELECT value FROM system_settings WHERE key = 'gemini_api_key')
WHERE key = 'ai_api_key'
  AND (value IS NULL OR value = '')
  AND EXISTS (SELECT 1 FROM system_settings WHERE key = 'gemini_api_key' AND value <> '');

DELETE FROM system_settings WHERE key IN ('gemini_api_key', 'ocr_api_url', 'ocr_api_key');

INSERT INTO system_settings (key, value) VALUES ('ai_last_test', '')
ON CONFLICT (key) DO NOTHING;
