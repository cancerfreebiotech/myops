-- T64: Teams Bot conversation references
-- Stores the Bot Framework conversation reference per user so the system
-- can send proactive Teams messages. Service-role access only.

CREATE TABLE teams_conversation_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teams_user_id TEXT NOT NULL,
  service_url TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  channel_id TEXT DEFAULT 'msteams',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

-- RLS enabled with NO policies: only the service role (which bypasses RLS)
-- can read/write this table.
ALTER TABLE teams_conversation_references ENABLE ROW LEVEL SECURITY;
