-- P0 修復：App 內建立採購文件（自動編號）自 20260612000009 起全數失敗。
-- 根因：doc_counters 啟用 RLS 後只有 SELECT policy，而 next_doc_no() 非 SECURITY DEFINER，
-- BEFORE INSERT trigger set_procurement_doc_no 以呼叫者身分 INSERT/UPDATE doc_counters 必被 RLS 擋
-- （42501: new row violates row-level security policy）。doc_counters 至今 0 筆可佐證。
-- 修法：改 SECURITY DEFINER（以 owner 身分寫計數表），並依慣例釘 search_path。
ALTER FUNCTION next_doc_no(text, text) SECURITY DEFINER SET search_path = public;
