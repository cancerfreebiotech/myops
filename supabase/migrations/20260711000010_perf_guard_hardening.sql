-- ============================================================
-- myOPS — 績效 guard 強化（第三輪深掃：補 20260711000001 的三個缺口）
-- 1) HR/admin 本人仍可自評自核：原 guard 對 is_admin()/hr_manager 一律放行，
--    未排除「本人」。改為放行需同時 v_uid <> NEW.user_id。
-- 2) 受評本人可直接 REST 跳關到 pending_manager，略過權重=100 與主管核定：
--    改為本人狀態轉換白名單（goal_setting→goals_submitted、goals_approved→pending_manager）。
-- 3) MFA 僅 API 強制、直打 REST 可繞過：把 aal2 要求下沉到 DB——
--    推進到 goals_approved/completed 或寫 manager_score 時，要求 JWT aal='aal2'。
-- ============================================================

CREATE OR REPLACE FUNCTION public.perf_reviews_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_uid uuid;
  v_aal text;
  v_is_mgr boolean;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;  -- 非請求情境
  END;
  IF v_uid IS NULL THEN
    RETURN NEW;  -- 系統 / service-role
  END IF;

  v_aal := COALESCE(auth.jwt() ->> 'aal', 'aal1');
  v_is_mgr := (NEW.manager_id = v_uid OR is_manager_of(NEW.user_id) OR is_admin() OR has_feature('hr_manager'));

  -- 主管 / HR / admin，且「非本人」：走主管路徑（仍需對敏感動作驗 MFA）
  IF v_is_mgr AND v_uid <> NEW.user_id THEN
    IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('goals_approved', 'completed'))
       OR NEW.manager_score IS DISTINCT FROM OLD.manager_score THEN
      IF v_aal <> 'aal2' THEN
        RAISE EXCEPTION 'forbidden: MFA (aal2) required for goal approval / final scoring';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- 其餘（受評本人，含身為 HR/admin 的本人）：禁止竄改主管專屬欄位
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

  -- 本人狀態轉換白名單：只允許 goal_setting→goals_submitted、goals_approved→pending_manager
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'goal_setting'    AND NEW.status = 'goals_submitted')
      OR (OLD.status = 'goals_approved' AND NEW.status = 'pending_manager')
    ) THEN
      RAISE EXCEPTION 'forbidden: invalid self status transition (%->%)', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.perf_goals_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_uid uuid;
  v_review_manager uuid;
  v_is_mgr boolean;
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
  v_is_mgr := (v_review_manager = v_uid OR is_manager_of(NEW.user_id) OR is_admin() OR has_feature('hr_manager'));

  -- 主管 / HR / admin，且非本人：放行
  IF v_is_mgr AND v_uid <> NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- 受評本人（含身為 HR/admin 的本人）：禁止竄改主管評分/評語
  IF NEW.manager_rating IS DISTINCT FROM OLD.manager_rating
     OR NEW.manager_note   IS DISTINCT FROM OLD.manager_note THEN
    RAISE EXCEPTION 'forbidden: cannot modify manager rating';
  END IF;

  RETURN NEW;
END;
$$;
