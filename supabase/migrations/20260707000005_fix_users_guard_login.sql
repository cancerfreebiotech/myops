-- ============================================================
-- myOPS — 修復 users_self_update_guard 在「登入授權」情境誤擋（Database error granting user）
-- 登入時 GoTrue 更新 auth.users.last_sign_in_at → on_auth_user_login → handle_user_login
-- 會 UPDATE public.users.last_login_at，進而觸發本 guard。guard 呼叫 auth.uid()/is_admin()，
-- 在無使用者 JWT 的系統情境下可能為 null 或報錯，導致整個登入交易失敗。
-- 修法：無 auth.uid()（系統/觸發器/service 情境）一律放行；僅對「真實使用者請求」把關。
-- 安全性不變：透過 PostgREST 竄改自身欄位的攻擊者，auth.uid() 一定存在，仍會被擋。
-- ============================================================

CREATE OR REPLACE FUNCTION public.users_self_update_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_uid uuid;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;  -- 非請求情境（auth.uid() 不可用）→ 放行
  END;

  IF v_uid IS NULL THEN
    RETURN NEW;  -- 系統 / 觸發器 / service-role 情境（如登入時 handle_user_login）→ 放行
  END IF;

  IF (SELECT role = 'admin' FROM public.users WHERE id = v_uid) THEN
    RETURN NEW;  -- admin 不受限
  END IF;

  IF NEW.role              IS DISTINCT FROM OLD.role
     OR NEW.granted_features   IS DISTINCT FROM OLD.granted_features
     OR NEW.is_active          IS DISTINCT FROM OLD.is_active
     OR NEW.manager_id         IS DISTINCT FROM OLD.manager_id
     OR NEW.department_id      IS DISTINCT FROM OLD.department_id
     OR NEW.deputy_approver_id IS DISTINCT FROM OLD.deputy_approver_id
     OR NEW.employment_type    IS DISTINCT FROM OLD.employment_type
     OR NEW.job_role           IS DISTINCT FROM OLD.job_role
     OR NEW.email              IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'forbidden: cannot modify privileged fields';
  END IF;
  RETURN NEW;
END;
$$;
