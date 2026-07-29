-- ============================================================
-- myOPS — 行事曆／資產函式：REVOKE PUBLIC（2026-07-29）
--
-- 【為什麼需要這一支】20260729000001 只寫了 `REVOKE ALL ... FROM anon`，但
-- Supabase 對 public schema 函式的預設授權會同時建立一筆 **PUBLIC** 授權
-- （proacl 裡開頭為 `=X/postgres` 的那筆）。anon 是透過 PUBLIC 繼承 EXECUTE 的，
-- 所以只移除具名的 anon 沒有效果 —— 上線後以公開 anon key 實測，
-- calendar_overview_leaves 仍然回傳 200。必須明確 REVOKE FROM PUBLIC。
--
-- （同一支 migration 中的 next_doc_no 寫的是 `FROM PUBLIC, anon, authenticated`，
--   所以它確實被擋下了 —— 差別就在有沒有列出 PUBLIC。）
--
-- 【為什麼不會擋到正常使用】三支函式都各自有具名的 `authenticated` /
-- `service_role` 授權（20260706000002 的 GRANT，以及 20260729000002 重建後的
-- GRANT），REVOKE PUBLIC 不影響具名授權。此處仍重新 GRANT 一次以保證幂等。
-- ============================================================

REVOKE ALL ON FUNCTION calendar_overview_leaves(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION calendar_overview_trips(DATE, DATE)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION approved_grs_for_asset()             FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION calendar_overview_leaves(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calendar_overview_trips(DATE, DATE)  TO authenticated;
GRANT EXECUTE ON FUNCTION approved_grs_for_asset()             TO authenticated;
