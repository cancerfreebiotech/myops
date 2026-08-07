-- is_admin() / has_feature() / auth_user_role() / auth_user_features() 都是
-- SELECT ... FROM users WHERE id = auth.uid()，但 users 自己「admin can do
-- everything」這條政策的條件正是 is_admin()——只要目標列的 is_active = false
-- （另一個 OR 分支 is_active=true 短路失敗），就會遞迴呼叫回 is_admin()、
-- 再讀一次 users、再套一次 RLS……無限遞迴到 stack depth limit exceeded。
--
-- 2026-08-07 首次踩到：users 表出現第一筆 is_active=false 的紀錄（離職／停用）
-- 後，任何掃到那一列的查詢（例如 /admin/users 的全員列表）就整支炸掉；因為呼叫端
-- 沒檢查 error，UI 端只看到「使用者列表是空的」。
--
-- 改成 SECURITY DEFINER，讓這 4 個函式內部「查自己那一列」的動作跳過 users 的
-- RLS，從根本斬斷遞迴。安全：這 4 個函式都只依 auth.uid() 查呼叫者自己那一列，
-- 不接受外部傳入的 user id 參數，無法被用來查看或推論其他人的資料。

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT role = 'admin' FROM users WHERE id = auth.uid()), false)
$function$;

CREATE OR REPLACE FUNCTION public.has_feature(feature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT role = 'admin' OR feature = ANY(COALESCE(granted_features, '{}'::TEXT[]))
    FROM users WHERE id = auth.uid()
  ), false)
$function$;

CREATE OR REPLACE FUNCTION public.auth_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM users WHERE id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.auth_user_features()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT granted_features FROM users WHERE id = auth.uid()
$function$;
