-- ============================================================
-- myOPS — 為所有呼叫 is_admin()/has_feature() 的函式釘住 search_path=public
-- 承 users_self_update_guard 的教訓：未加 schema 的 is_admin()/has_feature() 在
-- 受限 search_path 情境會找不到函式（42883）。這些 guard/RPC 目前只在一般 app
-- 情境（search_path 含 public）觸發故未壞，但釘住 search_path 可徹底防範同類問題。
-- 用 ALTER FUNCTION 只加設定、不動函式主體（零風險）。
-- ============================================================

ALTER FUNCTION public.assets_softdelete_guard() SET search_path = public;
ALTER FUNCTION public.document_recipients_self_update_guard() SET search_path = public;
ALTER FUNCTION public.documents_status_guard() SET search_path = public;
ALTER FUNCTION public.training_records_guard() SET search_path = public;
ALTER FUNCTION public.lab_lot_apply(p_lot_id uuid, p_action text, p_delta numeric, p_note text) SET search_path = public;
ALTER FUNCTION public.perf_kpi_summary(target_user_id uuid, from_date date, to_date date) SET search_path = public;
