-- ============================================================
-- myOPS — 公司活動：出席回覆（RSVP）＋ Outlook 全員推送紀錄
-- 1) company_event_rsvps：全員可看統計/名單；本人只能寫自己的列
-- 2) company_event_outlook_pushes：活動推到各使用者 Outlook 的
--    ms_event_id 紀錄，供刪除/更新時清理。service-role 專用
--    （啟 RLS、不建任何 authenticated 政策 = 一律拒絕）。
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 出席回覆
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_event_rsvps (
  event_id   UUID NOT NULL REFERENCES company_events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('attending', 'declined', 'maybe')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE company_event_rsvps ENABLE ROW LEVEL SECURITY;

-- 名單與統計全員可見
DROP POLICY IF EXISTS company_event_rsvps_select ON company_event_rsvps;
CREATE POLICY company_event_rsvps_select
  ON company_event_rsvps FOR SELECT TO authenticated
  USING (true);

-- 本人只能新增/修改自己的回覆
DROP POLICY IF EXISTS company_event_rsvps_insert ON company_event_rsvps;
CREATE POLICY company_event_rsvps_insert
  ON company_event_rsvps FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS company_event_rsvps_update ON company_event_rsvps;
CREATE POLICY company_event_rsvps_update
  ON company_event_rsvps FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS set_updated_at ON company_event_rsvps;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON company_event_rsvps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────────────────
-- Outlook 推送紀錄（service-role 專用）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_event_outlook_pushes (
  event_id    UUID NOT NULL REFERENCES company_events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ms_event_id TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE company_event_outlook_pushes ENABLE ROW LEVEL SECURITY;

-- 刻意「不建任何 policy」：RLS 啟用 + 無 policy = 拒絕所有 authenticated 存取。
-- 所有讀寫一律走真 service role（createAdminClient），比照 user_ms_tokens。
