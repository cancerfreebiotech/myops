-- ============================================================
-- myOPS — 撤銷「已核准」請假（稽核欄位 + 額度退還原子 RPC）
-- 使用者回報員工與管理員都無法取消已核准的請假；開放撤銷後，核准時扣掉的
-- leave_balances.used_days 必須跟著退還，否則額度會憑空消失。
-- 撤銷屬敏感操作（可能由 HR 代為執行），故在 leave_requests 上留下
-- cancelled_by / cancelled_at / cancel_reason 軌跡，事後可追。
-- 退還刻意做成與 deduct_leave_balance 對稱的原子 RPC（單一條件式 UPDATE），
-- 而非在 JS 端 read-then-write：同一餘額列的並發核准／撤銷若各自以相同舊值
-- 覆寫 used_days，會造成重複退還或退還遺失。
-- ============================================================

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- 依賴備忘：自撤（申請人撤銷自己已核准的假）之所以能過，是因為 leave_requests 的
-- UPDATE policy（20260705000002_security_fixes_2.sql）WITH CHECK 允許
-- `user_id = auth.uid() AND status IN ('pending','cancelled')` —— 寫入 'cancelled' 落在其中。
-- 若日後收緊這條 policy（例如限定只能從 pending 轉 cancelled），撤銷功能會靜默變成 409，
-- 屆時要一併調整 policy，不要只改應用層。
--
-- 退還失敗時的回捲（cancelled → approved）則**必須**用 service_role/admin client 執行：
-- 'approved' 不在上述 WITH CHECK 的允許清單內，一般員工用自身權限寫回會被 RLS 擋掉。

CREATE OR REPLACE FUNCTION restore_leave_balance(p_balance_id uuid, p_days numeric)
RETURNS TABLE(ok boolean, remaining numeric, clamped boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r          leave_balances;
  v_before   numeric;
BEGIN
  SELECT COALESCE(used_days, 0) INTO v_before FROM leave_balances WHERE id = p_balance_id;

  -- GREATEST(..., 0) 夾住下界：不論資料歷史或重複呼叫，已用天數都不得為負。
  -- 刻意「夾住而非拒絕」——若既有資料已不一致（used_days < 要退還的天數），
  -- 擋掉退還只會讓使用者連撤銷都做不到；夾住讓撤銷成功，另以 clamped 回報異常。
  UPDATE leave_balances
     SET used_days = GREATEST(COALESCE(used_days, 0) - p_days, 0)
   WHERE id = p_balance_id
  RETURNING * INTO r;

  IF r.id IS NOT NULL THEN
    -- clamped = true 代表夾住真的生效了（原本的已用天數少於要退還的天數），
    -- 即額度資料在此之前就已不一致。呼叫端應記錄警告，否則這種異常會被靜默吃掉、稽核查不出來。
    RETURN QUERY SELECT true, (r.total_days - COALESCE(r.used_days, 0)), (v_before < p_days);
    RETURN;
  END IF;

  -- 未更新：餘額列不存在 → 呼叫端須視為失敗並回捲單據狀態
  RETURN QUERY SELECT false, NULL::numeric, false;
END;
$$;

-- ── 權限收斂（安全性修復，兩支額度 RPC 一起處理）─────────────────────────
-- 這兩支都是 SECURITY DEFINER（繞過 RLS），且應用層**只**透過 createAdminClient()
-- （service_role key）呼叫。但 Supabase 對 public schema 新函式有預設授權，
-- 會自動 GRANT EXECUTE 給 anon 與 authenticated；單純 `REVOKE ... FROM PUBLIC`
-- 收不掉這兩個「明確授權」。
--
-- 後果（已於正式庫確認 deduct_leave_balance 存在此問題）：任何登入者都能直接打
-- PostgREST 的 /rpc/restore_leave_balance，帶自己的 leave_balances.id（RLS 允許
-- 本人讀取，所以 id 拿得到）把 used_days 歸零 → 等於無限額度的特休/病假。
-- deduct 方向雖然只能扣自己的額度（自傷），一併收斂以免留下不對稱的洞。
--
-- 因此明確 REVOKE anon 與 authenticated，只留 service_role。
REVOKE ALL ON FUNCTION restore_leave_balance(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION restore_leave_balance(uuid, numeric) TO service_role;

REVOKE ALL ON FUNCTION deduct_leave_balance(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION deduct_leave_balance(uuid, numeric) TO service_role;
