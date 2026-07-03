-- AI 政策問答 feature flag（無新表；LLM key 沿用 system_settings.gemini_api_key）
INSERT INTO system_settings (key, value)
VALUES ('feature.ask_ai', 'false')
ON CONFLICT (key) DO NOTHING;
