-- ============================================================
-- myOPS — 回饋留言串（feedback_comments）
-- admin（沿用 is_admin()）或父回饋 submitted_by 本人可 SELECT / INSERT。
-- INSERT 需 author_id = auth.uid()。GRANT 給 authenticated。
-- 註：feedback 表已有「submitted_by = auth.uid() OR is_admin()」的 SELECT 政策，
--     故本檔不再重複新增 feedback 的本人 SELECT 政策。
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_comments_feedback
  ON feedback_comments(feedback_id, created_at);

ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;

-- admin 或父回饋提交者本人可讀
DROP POLICY IF EXISTS "feedback_comments: admin or submitter can read" ON feedback_comments;
CREATE POLICY "feedback_comments: admin or submitter can read"
  ON feedback_comments FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM feedback f
      WHERE f.id = feedback_comments.feedback_id
        AND f.submitted_by = auth.uid()
    )
  );

-- admin 或父回饋提交者本人可留言，且 author_id 必須為自己
DROP POLICY IF EXISTS "feedback_comments: admin or submitter can insert" ON feedback_comments;
CREATE POLICY "feedback_comments: admin or submitter can insert"
  ON feedback_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM feedback f
        WHERE f.id = feedback_comments.feedback_id
          AND f.submitted_by = auth.uid()
      )
    )
  );

GRANT SELECT, INSERT ON feedback_comments TO authenticated;
