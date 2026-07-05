-- ============================================================
-- myOPS — 安全與正確性修復（2026-07-05 稽核）
-- 涵蓋：報帳/出差取消被 RLS 擋下、履歷 storage 外洩、
--       試劑批次庫存原子性/狀態機、訓練時數竄改、證照復活、資產軟刪除繞過
-- ============================================================

-- ── 1. 報帳：補 WITH CHECK，讓本人可取消 pending，但擋自我核准 ──
-- 原 policy 只有 USING (user_id=auth.uid() AND status='pending')，缺 WITH CHECK
-- → PostgreSQL 以 USING 檢查更新後新列，status 變 'cancelled' 必違規回 500。
DROP POLICY IF EXISTS expense_claims_own_update ON expense_claims;
CREATE POLICY expense_claims_own_update
  ON expense_claims FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status IN ('pending', 'cancelled'));

-- ── 2. 出差：同上，補 WITH CHECK ──────────────────────────────
DROP POLICY IF EXISTS business_trips_update ON business_trips;
CREATE POLICY business_trips_update
  ON business_trips FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR approver_id = auth.uid()
    OR is_admin() OR has_feature('hr_manager')
  )
  WITH CHECK (
    (user_id = auth.uid() AND status IN ('pending', 'cancelled'))
    OR approver_id = auth.uid()
    OR is_admin() OR has_feature('hr_manager')
  );

-- ── 3. 履歷 storage：限 admin / hr_manager 讀寫（原為全員） ─────
-- 下載走 /api/storage/download 以使用者 JWT 建 signed URL，受 storage RLS 管轄，
-- 故收緊 RLS 即可擋住非 HR，HR（hr_manager）仍可正常存取。
DROP POLICY IF EXISTS "recruiting-files bucket: authenticated can upload" ON storage.objects;
CREATE POLICY "recruiting-files bucket: hr can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recruiting-files' AND (is_admin() OR has_feature('hr_manager')));

DROP POLICY IF EXISTS "recruiting-files bucket: authenticated can read" ON storage.objects;
CREATE POLICY "recruiting-files bucket: hr can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recruiting-files' AND (is_admin() OR has_feature('hr_manager')));

-- ── 4. 試劑批次：原子化的異動 RPC（取代 route 的 read-modify-write）─
-- 修四個問題：(a) lost update → SELECT FOR UPDATE；(b) discarded 批次仍可操作
-- → 狀態機檢查；(c) 超領靜默 clamp → RAISE insufficient_stock；(d) 異動與 log
-- 非交易 → 同一函數內完成。SECURITY DEFINER 故自行做授權檢查。
CREATE OR REPLACE FUNCTION lab_lot_apply(
  p_lot_id UUID, p_action TEXT, p_delta NUMERIC, p_note TEXT
) RETURNS lab_lots
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lot     lab_lots;
  v_new_qty NUMERIC;
  v_delta   NUMERIC := 0;
BEGIN
  IF NOT (is_admin() OR has_feature('lab_manage')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_lot FROM lab_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_lot.status = 'discarded' THEN RAISE EXCEPTION 'invalid_state'; END IF;

  IF p_action IN ('use', 'adjust') THEN
    IF p_delta IS NULL OR p_delta = 0 THEN RAISE EXCEPTION 'bad_delta'; END IF;
    IF p_action = 'use' AND p_delta >= 0 THEN RAISE EXCEPTION 'bad_delta'; END IF;
    v_new_qty := v_lot.quantity + p_delta;
    IF v_new_qty < 0 THEN RAISE EXCEPTION 'insufficient_stock'; END IF;
    UPDATE lab_lots SET
      quantity = v_new_qty,
      status = CASE
        WHEN v_new_qty = 0 THEN 'depleted'
        WHEN status = 'depleted' AND v_new_qty > 0 THEN 'in_stock'
        ELSE status END
    WHERE id = p_lot_id RETURNING * INTO v_lot;
    v_delta := p_delta;
  ELSIF p_action = 'open' THEN
    UPDATE lab_lots SET opened_at = COALESCE(opened_at, NOW())
    WHERE id = p_lot_id RETURNING * INTO v_lot;
  ELSIF p_action = 'discard' THEN
    UPDATE lab_lots SET status = 'discarded'
    WHERE id = p_lot_id RETURNING * INTO v_lot;
  ELSE
    RAISE EXCEPTION 'bad_action';
  END IF;

  INSERT INTO lab_lot_logs (lot_id, action, quantity_delta, user_id, note)
  VALUES (p_lot_id, p_action, v_delta, auth.uid(),
          NULLIF(btrim(COALESCE(p_note, '')), ''));

  RETURN v_lot;
END;
$$;

-- ── 5. 訓練記錄：禁止非管理者竄改 hours（時數應由課程/管理者定義）──
CREATE OR REPLACE FUNCTION training_records_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (is_admin() OR has_feature('training_manage')) THEN
    IF NEW.hours IS DISTINCT FROM OLD.hours THEN
      RAISE EXCEPTION 'forbidden: cannot modify hours';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_records_guard ON training_records;
CREATE TRIGGER training_records_guard
  BEFORE UPDATE ON training_records
  FOR EACH ROW EXECUTE FUNCTION training_records_guard();

-- ── 6. 證照：本人 self-update 不得復活已軟刪除的列 ────────────
DROP POLICY IF EXISTS certifications_self_update ON certifications;
CREATE POLICY certifications_self_update
  ON certifications FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND deleted_at IS NULL)
    OR is_admin() OR has_feature('training_manage')
  )
  WITH CHECK (
    (user_id = auth.uid() AND deleted_at IS NULL)
    OR is_admin() OR has_feature('training_manage')
  );

-- ── 7. 資產：禁止非 admin 透過 UPDATE 設 deleted_at（軟刪除限 admin）─
CREATE OR REPLACE FUNCTION assets_softdelete_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) AND NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: only admin can (un)delete assets';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_softdelete_guard ON assets;
CREATE TRIGGER assets_softdelete_guard
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_softdelete_guard();
