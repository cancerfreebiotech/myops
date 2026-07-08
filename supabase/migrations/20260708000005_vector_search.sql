-- ============================================================
-- myOPS — AI 政策問答向量檢索（pgvector）
-- 1) 啟用 pgvector；doc_chunks 存文件切段與 embedding（不定維度：
--    以管理員所設 embedding 模型為準；文件量小不建 ANN 索引，順掃即可）
-- 2) doc_chunks 僅 service-role 可存取（RLS enable、無 policy）——
--    內容等同文件全文，讀取授權一律走 API 層
-- 3) match_doc_chunks()：以 cosine 距離取 top-k 相關段落（只含已核准未刪文件）
-- 4) 新增 embedding 連線設定列（URL/Key 留空沿用 AI 連線；model 必填才啟用）
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS doc_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  lang        TEXT NOT NULL DEFAULT 'zh',
  content     TEXT NOT NULL,
  embedding   VECTOR NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc ON doc_chunks(doc_id);

ALTER TABLE doc_chunks ENABLE ROW LEVEL SECURITY;
-- 無 policy：僅 service-role 可存取

CREATE OR REPLACE FUNCTION match_doc_chunks(query_embedding VECTOR, match_count INT DEFAULT 12)
RETURNS TABLE (doc_id UUID, title TEXT, content TEXT, similarity FLOAT)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.doc_id, d.title, c.content, 1 - (c.embedding <=> query_embedding) AS similarity
  FROM doc_chunks c
  JOIN documents d ON d.id = c.doc_id
  WHERE d.deleted_at IS NULL AND d.status = 'approved'
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count
$$;

-- 僅 service-role 可呼叫（RAG 檢索一律經 API 層授權後執行）
REVOKE EXECUTE ON FUNCTION match_doc_chunks(VECTOR, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION match_doc_chunks(VECTOR, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION match_doc_chunks(VECTOR, INT) TO service_role;

INSERT INTO system_settings (key, value) VALUES
  ('ai_embed_base_url', ''),
  ('ai_embed_api_key', ''),
  ('ai_embed_model', '')
ON CONFLICT (key) DO NOTHING;
