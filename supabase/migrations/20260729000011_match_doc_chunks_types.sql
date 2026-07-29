-- ============================================================
-- myOPS — Ask-AI 語料 doc_type 收斂成單一來源（防未來漂移，行為等價）
--
-- 背景：可問答的 doc_type 白名單原本寫死在三處——src/lib/doc-index.ts、
-- src/lib/policy-qa.ts、以及本函式。三處目前一致（REG/ANN/INTERNAL），
-- 所以不是現行漏洞；風險是任一處日後被改動而其他兩處沒跟上，最壞情況是
-- 把合約（NDA/MOU/CONTRACT/AMEND）餵進對全體員工開放的問答。
--
-- 做法：TS 端新增單一來源 src/lib/doc-index-types.ts，並讓呼叫端把白名單
-- 當參數傳進來。刻意不動檢索邏輯（距離運算、排序、LIMIT、status/deleted_at
-- 過濾、STABLE、search_path 全部原樣保留）——這支是向量檢索核心，這次只是
-- 把「硬編清單」換成「參數化 + 同值預設」。
--
-- 為什麼要 DROP 再建，而不是直接 CREATE OR REPLACE 加參數：
-- 加參數會產生第二個 overload（vector,int）與（vector,int,text[])。呼叫端走
-- PostgREST rpc()，它以「body 的 key 集合」挑函式，一個候選的參數是另一個的
-- 子集時會回 "Could not choose the best candidate function"——連現有的兩參數
-- 呼叫都會壞掉。因此保留單一候選：先 DROP 兩參數版，再建三參數版，第三個
-- 參數帶預設值，舊的兩參數呼叫（含任何位置參數呼叫）仍然可用。
-- 不加 CASCADE：若有沒盤到的相依物件，要讓 migration 大聲失敗而不是默默砍掉。
--
-- allowed_doc_types 傳 NULL 或空陣列時 = ANY(...) 為 false → 一列都不回（fail
-- closed）。這是刻意的：檢索不到會退回全文模式，而全文模式在 app 層仍有同一份
-- 白名單過濾，寧可少回也不要多回。
--
-- 授權：新簽名是「新函式」，20260708000005 的 REVOKE 不會延續，Supabase 對
-- public schema 新函式的預設授權會自動放給 anon/authenticated，故必須重下一次。
-- 目標 ACL 與舊函式相同：{postgres=X/postgres, service_role=X/postgres}。
-- ============================================================

DROP FUNCTION IF EXISTS match_doc_chunks(VECTOR, INT);

CREATE OR REPLACE FUNCTION match_doc_chunks(
  query_embedding   VECTOR,
  match_count       INT DEFAULT 12,
  -- 預設值須與 src/lib/doc-index-types.ts 的 ASK_AI_DOC_TYPES 一致；
  -- 正常路徑由 policy-qa 明確傳入，這個預設值只是第二層防線
  allowed_doc_types TEXT[] DEFAULT ARRAY['REG', 'ANN', 'INTERNAL']
)
RETURNS TABLE (doc_id UUID, title TEXT, content TEXT, similarity FLOAT)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.doc_id, d.title, c.content, 1 - (c.embedding <=> query_embedding) AS similarity
  FROM doc_chunks c
  JOIN documents d ON d.id = c.doc_id
  WHERE d.deleted_at IS NULL
    AND d.status = 'approved'
    AND d.doc_type = ANY(allowed_doc_types)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count
$$;

-- 僅 service-role 可呼叫（函式內部沒有授權檢查，RAG 檢索一律經 API 層授權後執行）
REVOKE EXECUTE ON FUNCTION match_doc_chunks(VECTOR, INT, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION match_doc_chunks(VECTOR, INT, TEXT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION match_doc_chunks(VECTOR, INT, TEXT[]) TO service_role;
