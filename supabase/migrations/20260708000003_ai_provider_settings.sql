-- ============================================================
-- myOPS — AI 設定改為供應商通用（openai / anthropic / gemini）
-- 新增四個 system_settings 列供 /admin/settings 顯示與編輯：
--   ai_provider  供應商（openai / anthropic / gemini，預設 gemini）
--   ai_api_key   API key（未設時程式退回舊 gemini_api_key，向下相容）
--   ai_base_url  選填端點（OpenAI 相容端點如 Groq/Ollama/LiteLLM，或官方替代端點）
--   ai_model     選填模型（未設時用各供應商預設）
-- 舊 gemini_api_key 列保留（向下相容 fallback）。
-- ============================================================

INSERT INTO system_settings (key, value) VALUES
  ('ai_provider', 'gemini'),
  ('ai_api_key', ''),
  ('ai_base_url', ''),
  ('ai_model', '')
ON CONFLICT (key) DO NOTHING;
