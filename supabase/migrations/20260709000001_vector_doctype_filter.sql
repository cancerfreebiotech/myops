-- ============================================================
-- myOPS — 向量檢索補洞：限制政策類文件（critical 修復）
-- match_doc_chunks 原本只過濾 status='approved'，未過濾 doc_type，
-- 導致合約/NDA/MOU 若被索引，內容會經 AI 政策問答洩漏給全體員工。
-- 1) 函式加 doc_type IN ('REG','ANN','INTERNAL')（與 policy-qa 全文模式一致）
-- 2) 清除已存在的非政策類文件段落（防禦性：app 層同步只索引政策類）
-- ============================================================

CREATE OR REPLACE FUNCTION match_doc_chunks(query_embedding VECTOR, match_count INT DEFAULT 12)
RETURNS TABLE (doc_id UUID, title TEXT, content TEXT, similarity FLOAT)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.doc_id, d.title, c.content, 1 - (c.embedding <=> query_embedding) AS similarity
  FROM doc_chunks c
  JOIN documents d ON d.id = c.doc_id
  WHERE d.deleted_at IS NULL
    AND d.status = 'approved'
    AND d.doc_type IN ('REG', 'ANN', 'INTERNAL')
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count
$$;

DELETE FROM doc_chunks c
USING documents d
WHERE d.id = c.doc_id
  AND d.doc_type NOT IN ('REG', 'ANN', 'INTERNAL');
