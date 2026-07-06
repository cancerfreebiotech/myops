-- ============================================================
-- myOPS — Outlook 單向同步：每人 Microsoft refresh token 儲存
-- 核准請假/出差時，以「當事人身分」在其 Outlook 建立事件（當事人本人未在線也能推）。
-- ============================================================

CREATE TABLE IF NOT EXISTS user_ms_tokens (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  connected_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_ms_tokens ENABLE ROW LEVEL SECURITY;

-- 刻意「不建任何 policy」：RLS 啟用 + 無 policy = 一律拒絕 authenticated 存取，
-- refresh_token 不會經 PostgREST 外洩。所有讀寫（callback 存 token、核准時讀他人 token、
-- isMsConnected 查詢）一律走真 service role（createAdminClient）繞過 RLS。

-- 出差也要能存 Outlook 事件 id（請假已有 outlook_event_id）
ALTER TABLE business_trips ADD COLUMN IF NOT EXISTS outlook_event_id TEXT;

DROP TRIGGER IF EXISTS set_updated_at ON user_ms_tokens;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_ms_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
