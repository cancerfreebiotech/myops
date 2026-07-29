-- ============================================================
-- myOPS — SECURITY DEFINER 函式全面移除 anon/PUBLIC（2026-07-29）
--
-- 【背景】盤點正式庫後，扣掉 trigger 函式（回傳型別 trigger，PostgREST 無法呼叫，
-- 屬 ACL 雜訊）之後，共 12 支 SECURITY DEFINER 函式未登入即可執行 —— 全部都是
-- Supabase 對 public schema 的預設授權自動加上的 PUBLIC/anon，並非任何 migration
-- 的本意。這 12 支都有內部授權檢查，經 20260729000001 把 is_admin()/has_feature()
-- 改為 fail-closed 之後已不再被繞過；本檔是**第二層防線**：未登入者連函式都執行不到。
--
-- 【安全性確認】
-- 1. 其中 6 支是 RLS policy 用到的 helper 述詞（is_manager_of、dr_is_any_viewer、
--    dr_is_viewer_of、dr_is_groupmate_of、dr_shares_group_with_me、dr_can_manage_task），
--    **必須保留 authenticated 的 EXECUTE**，否則 policy 評估失敗、整個 RLS 壞掉。
--    本檔一律「REVOKE PUBLIC, anon → 再明確 GRANT authenticated」，具名授權不受影響。
-- 2. 已查核 `pg_policies`：沒有任何 roles 含 public 的 policy 引用這些述詞
--    （查詢結果 0 筆），因此移除 anon 不會讓 anon 的查詢從「回 0 筆」變成報錯。
-- 3. 另 6 支是可直接呼叫的 API 面（approve_leave_qualification、
--    approve_makeup_request、calendar_dept_leaves、gr_is_convertible、
--    lab_lot_apply、perf_kpi_summary），全部由登入使用者經 route 呼叫，
--    authenticated 保留即可，未登入本來就不該碰。
--
-- 【判斷準則（寫新 RPC 時請沿用）】函式內部**沒有** auth.uid()/is_admin()/has_feature()
-- 檢查 ⇒ 只能 GRANT service_role；且 REVOKE 必須寫成 `FROM PUBLIC, anon, authenticated`，
-- 只寫 FROM PUBLIC 或只寫 FROM anon 都收不乾淨（PUBLIC 與具名授權是兩筆獨立 ACL）。
-- ============================================================

DO $$
DECLARE
  fn RECORD;
  n_revoked INT := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prosecdef
      AND pg_get_function_result(p.oid) <> 'trigger'
      AND (p.proacl IS NULL
           OR EXISTS (SELECT 1 FROM unnest(p.proacl) a
                      WHERE a::text LIKE '=%' OR a::text LIKE 'anon=%'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    n_revoked := n_revoked + 1;
  END LOOP;
  RAISE NOTICE '[20260729000004] revoked anon/PUBLIC on % SECURITY DEFINER function(s)', n_revoked;
END $$;
