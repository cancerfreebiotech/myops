-- ============================================================
-- myOPS — 績效考核越權修補（第三輪審查 2 個 high + 1 個 low）
-- 問題：perf_reviews_update / perf_goals_update 的 policy 只有 USING、無 WITH CHECK，
-- 且無 guard trigger。app 用 anon key + 使用者 JWT 走 RLS，受評員工可繞過 API
-- 直接 PATCH /rest/v1/performance_reviews?id=eq.<自己> 設 status='completed',
-- manager_score=5，自我打滿分（performance_goals.manager_rating 同理）。
-- 修法：比照 users_self_update_guard —— BEFORE UPDATE guard trigger，
-- 當 auth.uid() 非主管/HR/admin（即受評本人）時，禁止變更主管專屬欄位與
-- 主管專屬狀態轉換（goals_approved / completed）。系統/service 情境（auth.uid() NULL）放行。
-- 順修：is_manager_of() SECURITY DEFINER 釘住 search_path（本專案 hardening 標準）。
-- ============================================================

-- is_manager_of 釘 search_path（未加 schema 的 auth.uid()/users 在受限 search_path 會失敗）
ALTER FUNCTION is_manager_of(target_user_id UUID) SET search_path = public;

-- performance_reviews guard
CREATE OR REPLACE FUNCTION public.perf_reviews_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_uid uuid;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;  -- 非請求情境
  END;
  IF v_uid IS NULL THEN
    RETURN NEW;  -- 系統 / service-role
  END IF;

  -- 主管 / HR / admin：全權放行
  IF NEW.manager_id = v_uid
     OR is_manager_of(NEW.user_id)
     OR is_admin()
     OR has_feature('hr_manager') THEN
    RETURN NEW;
  END IF;

  -- 其餘（受評本人）：禁止竄改主管專屬欄位
  IF NEW.manager_score     IS DISTINCT FROM OLD.manager_score
     OR NEW.manager_comment   IS DISTINCT FROM OLD.manager_comment
     OR NEW.goals_approved_by IS DISTINCT FROM OLD.goals_approved_by
     OR NEW.goals_approved_at IS DISTINCT FROM OLD.goals_approved_at
     OR NEW.completed_by      IS DISTINCT FROM OLD.completed_by
     OR NEW.completed_at      IS DISTINCT FROM OLD.completed_at
     OR NEW.return_reason     IS DISTINCT FROM OLD.return_reason
     OR NEW.manager_id        IS DISTINCT FROM OLD.manager_id THEN
    RAISE EXCEPTION 'forbidden: cannot modify manager-only review fields';
  END IF;

  -- 禁止本人推進到主管專屬狀態
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('goals_approved', 'completed') THEN
    RAISE EXCEPTION 'forbidden: cannot advance review to manager-only status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perf_reviews_guard_trg ON performance_reviews;
CREATE TRIGGER perf_reviews_guard_trg
  BEFORE UPDATE ON performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.perf_reviews_guard();

-- performance_goals guard
CREATE OR REPLACE FUNCTION public.perf_goals_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_uid uuid;
  v_review_manager uuid;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT manager_id INTO v_review_manager FROM performance_reviews WHERE id = NEW.review_id;

  IF v_review_manager = v_uid
     OR is_manager_of(NEW.user_id)
     OR is_admin()
     OR has_feature('hr_manager') THEN
    RETURN NEW;
  END IF;

  -- 受評本人：禁止竄改主管評分/評語（本人只能改 self_rating / self_note）
  IF NEW.manager_rating IS DISTINCT FROM OLD.manager_rating
     OR NEW.manager_note   IS DISTINCT FROM OLD.manager_note THEN
    RAISE EXCEPTION 'forbidden: cannot modify manager rating';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perf_goals_guard_trg ON performance_goals;
CREATE TRIGGER perf_goals_guard_trg
  BEFORE UPDATE ON performance_goals
  FOR EACH ROW EXECUTE FUNCTION public.perf_goals_guard();
