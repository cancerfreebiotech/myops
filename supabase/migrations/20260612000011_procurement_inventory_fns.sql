-- ============================================================
-- myOPS — Procurement Module: Atomic inventory posting functions
--
-- post_inbound / post_outbound apply an inbound/outbound order to
-- warehouse_stock and write the stock_movements ledger in one transaction.
-- unpost_inbound / unpost_outbound revert a posting by writing reversing
-- 'void' movements (the ledger keeps the full history; nothing is deleted).
--
-- Idempotency: posting requires posted_at IS NULL and stamps posted_at;
-- unposting requires posted_at IS NOT NULL and clears it. The order row is
-- locked FOR UPDATE so concurrent calls serialize.
-- All quantities are in 庫存單位 (stock units).
-- SECURITY DEFINER + EXECUTE revoked from clients: only the service role
-- (API layer) may call these.
-- ============================================================

ALTER TABLE inbound_orders  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────
-- post_inbound(p_inbound_id, p_user_id?)
-- For each inbound_items row: find warehouse_stock by
-- (product_id, warehouse_id, lot_no) — existing lot → add quantity,
-- missing → create a new lot row (stock_code via next_doc_no('stock','STK')).
-- Writes one 'inbound' movement (+qty) per line and refreshes the
-- products.current_stock_qty cache.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION post_inbound(p_inbound_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order    inbound_orders%ROWTYPE;
  v_item     inbound_items%ROWTYPE;
  v_stock    warehouse_stock%ROWTYPE;
  v_product  products%ROWTYPE;
  v_stock_id UUID;
  v_actor    UUID;
  v_count    INTEGER := 0;
BEGIN
  SELECT * INTO v_order FROM inbound_orders WHERE id = p_inbound_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inbound order % not found', p_inbound_id USING ERRCODE = 'P0002';
  END IF;
  IF v_order.posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'inbound order % is already posted', v_order.doc_no USING ERRCODE = 'P0003';
  END IF;

  v_actor := COALESCE(p_user_id, v_order.created_by);

  FOR v_item IN
    SELECT * FROM inbound_items
    WHERE inbound_order_id = p_inbound_id
    ORDER BY line_no NULLS LAST, created_at
  LOOP
    IF v_item.product_id IS NULL THEN
      RAISE EXCEPTION 'inbound item % has no product', COALESCE(v_item.line_no, 0) USING ERRCODE = 'P0004';
    END IF;
    IF v_item.warehouse_id IS NULL THEN
      RAISE EXCEPTION 'inbound item % has no warehouse', COALESCE(v_item.line_no, 0) USING ERRCODE = 'P0004';
    END IF;
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'inbound item % has a non-positive quantity', COALESCE(v_item.line_no, 0) USING ERRCODE = 'P0004';
    END IF;

    SELECT * INTO v_product FROM products WHERE id = v_item.product_id;

    -- 批號自動判斷: existing (product, warehouse, lot) → add; missing → new lot row
    SELECT * INTO v_stock FROM warehouse_stock
    WHERE product_id = v_item.product_id
      AND warehouse_id = v_item.warehouse_id
      AND lot_no IS NOT DISTINCT FROM v_item.lot_no
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE warehouse_stock
      SET quantity    = quantity + v_item.quantity,
          expiry_date = COALESCE(warehouse_stock.expiry_date, v_item.expiry_date),
          updated_by  = v_actor,
          updated_at  = NOW()
      WHERE id = v_stock.id;
      v_stock_id := v_stock.id;
    ELSE
      INSERT INTO warehouse_stock (
        warehouse_id, product_id, stock_code, lot_no, expiry_date, quantity,
        product_code, product_name, spec, product_type, unit,
        created_by, updated_by
      ) VALUES (
        v_item.warehouse_id, v_item.product_id, next_doc_no('stock', 'STK'),
        v_item.lot_no, v_item.expiry_date, v_item.quantity,
        COALESCE(v_item.product_code, v_product.product_code),
        COALESCE(v_item.product_name, v_product.name),
        COALESCE(v_item.spec, v_product.spec),
        v_product.product_type,
        COALESCE(v_item.unit, v_product.stock_unit),
        v_actor, v_actor
      )
      RETURNING id INTO v_stock_id;
    END IF;

    -- backfill the resolved stock reference on the line (traceability + unpost)
    UPDATE inbound_items
    SET warehouse_stock_id = v_stock_id,
        stock_code = (SELECT stock_code FROM warehouse_stock WHERE id = v_stock_id),
        updated_at = NOW()
    WHERE id = v_item.id;

    INSERT INTO stock_movements (
      product_id, warehouse_stock_id, warehouse_id, delta_qty,
      movement_type, doc_type, doc_id, created_by
    ) VALUES (
      v_item.product_id, v_stock_id, v_item.warehouse_id, v_item.quantity,
      'inbound', 'inbound_order', p_inbound_id, v_actor
    );

    UPDATE products
    SET current_stock_qty = COALESCE(current_stock_qty, 0) + v_item.quantity,
        updated_at = NOW()
    WHERE id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'inbound order % has no items', v_order.doc_no USING ERRCODE = 'P0004';
  END IF;

  UPDATE inbound_orders
  SET posted_at = NOW(), stocked_at = NOW(), updated_by = v_actor, updated_at = NOW()
  WHERE id = p_inbound_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- post_outbound(p_outbound_id, p_user_id?)
-- For each outbound_items row: resolve the warehouse_stock row
-- (warehouse_stock_id, else stock_code), deduct used_qty (insufficient
-- stock → exception), write one 'outbound' movement (-qty) and refresh
-- the products.current_stock_qty cache.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION post_outbound(p_outbound_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order   outbound_orders%ROWTYPE;
  v_item    outbound_items%ROWTYPE;
  v_stock   warehouse_stock%ROWTYPE;
  v_actor   UUID;
  v_count   INTEGER := 0;
  v_product UUID;
BEGIN
  SELECT * INTO v_order FROM outbound_orders WHERE id = p_outbound_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound order % not found', p_outbound_id USING ERRCODE = 'P0002';
  END IF;
  IF v_order.posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'outbound order % is already posted', v_order.doc_no USING ERRCODE = 'P0003';
  END IF;

  v_actor := COALESCE(p_user_id, v_order.created_by);

  FOR v_item IN
    SELECT * FROM outbound_items
    WHERE outbound_order_id = p_outbound_id
    ORDER BY line_no NULLS LAST, created_at
  LOOP
    IF v_item.used_qty IS NULL OR v_item.used_qty <= 0 THEN
      RAISE EXCEPTION 'outbound item % has a non-positive quantity', COALESCE(v_item.line_no, 0) USING ERRCODE = 'P0004';
    END IF;

    IF v_item.warehouse_stock_id IS NOT NULL THEN
      SELECT * INTO v_stock FROM warehouse_stock WHERE id = v_item.warehouse_stock_id FOR UPDATE;
    ELSIF v_item.stock_code IS NOT NULL THEN
      SELECT * INTO v_stock FROM warehouse_stock WHERE stock_code = v_item.stock_code FOR UPDATE;
    ELSE
      RAISE EXCEPTION 'outbound item % has no stock reference', COALESCE(v_item.line_no, 0) USING ERRCODE = 'P0004';
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'stock row for outbound item % not found', COALESCE(v_item.line_no, 0) USING ERRCODE = 'P0002';
    END IF;

    IF v_stock.quantity < v_item.used_qty THEN
      RAISE EXCEPTION 'insufficient stock for % (lot %): have %, need %',
        v_stock.stock_code, COALESCE(v_stock.lot_no, '-'), v_stock.quantity, v_item.used_qty
        USING ERRCODE = 'P0005';
    END IF;

    UPDATE warehouse_stock
    SET quantity = quantity - v_item.used_qty, updated_by = v_actor, updated_at = NOW()
    WHERE id = v_stock.id;

    v_product := COALESCE(v_item.product_id, v_stock.product_id);

    -- snapshot before/after quantities on the line
    UPDATE outbound_items
    SET warehouse_stock_id = v_stock.id,
        stock_code    = v_stock.stock_code,
        warehouse_qty = v_stock.quantity,
        qty_after_use = v_stock.quantity - v_item.used_qty,
        updated_at    = NOW()
    WHERE id = v_item.id;

    INSERT INTO stock_movements (
      product_id, warehouse_stock_id, warehouse_id, delta_qty,
      movement_type, doc_type, doc_id, created_by
    ) VALUES (
      v_product, v_stock.id, v_stock.warehouse_id, -v_item.used_qty,
      'outbound', 'outbound_order', p_outbound_id, v_actor
    );

    UPDATE products
    SET current_stock_qty = COALESCE(current_stock_qty, 0) - v_item.used_qty,
        updated_at = NOW()
    WHERE id = v_product;

    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'outbound order % has no items', v_order.doc_no USING ERRCODE = 'P0004';
  END IF;

  UPDATE outbound_orders
  SET posted_at = NOW(), deducted_at = NOW(), updated_by = v_actor, updated_at = NOW()
  WHERE id = p_outbound_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- unpost_inbound / unpost_outbound
-- Revert a posting by writing reversing 'void' movements for the document's
-- net ledger effect per stock row (net = SUM of all this doc's movements,
-- so repeated post→unpost cycles stay consistent), restoring warehouse_stock
-- and the products cache, then clearing posted_at.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION unpost_inbound(p_inbound_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order inbound_orders%ROWTYPE;
  v_stock warehouse_stock%ROWTYPE;
  v_actor UUID;
  r       RECORD;
BEGIN
  SELECT * INTO v_order FROM inbound_orders WHERE id = p_inbound_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inbound order % not found', p_inbound_id USING ERRCODE = 'P0002';
  END IF;
  IF v_order.posted_at IS NULL THEN
    RAISE EXCEPTION 'inbound order % is not posted', v_order.doc_no USING ERRCODE = 'P0003';
  END IF;

  v_actor := COALESCE(p_user_id, v_order.created_by);

  FOR r IN
    SELECT product_id, warehouse_stock_id, warehouse_id, SUM(delta_qty) AS net
    FROM stock_movements
    WHERE doc_type = 'inbound_order' AND doc_id = p_inbound_id AND warehouse_stock_id IS NOT NULL
    GROUP BY product_id, warehouse_stock_id, warehouse_id
    HAVING SUM(delta_qty) <> 0
  LOOP
    SELECT * INTO v_stock FROM warehouse_stock WHERE id = r.warehouse_stock_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'stock row % no longer exists', r.warehouse_stock_id USING ERRCODE = 'P0002';
    END IF;
    IF v_stock.quantity - r.net < 0 THEN
      RAISE EXCEPTION 'cannot unpost %: stock % already consumed (have %, would remove %)',
        v_order.doc_no, v_stock.stock_code, v_stock.quantity, r.net USING ERRCODE = 'P0005';
    END IF;

    UPDATE warehouse_stock
    SET quantity = quantity - r.net, updated_by = v_actor, updated_at = NOW()
    WHERE id = v_stock.id;

    INSERT INTO stock_movements (
      product_id, warehouse_stock_id, warehouse_id, delta_qty,
      movement_type, doc_type, doc_id, note, created_by
    ) VALUES (
      r.product_id, r.warehouse_stock_id, r.warehouse_id, -r.net,
      'void', 'inbound_order', p_inbound_id, 'unpost', v_actor
    );

    UPDATE products
    SET current_stock_qty = COALESCE(current_stock_qty, 0) - r.net,
        updated_at = NOW()
    WHERE id = r.product_id;
  END LOOP;

  UPDATE inbound_orders
  SET posted_at = NULL, stocked_at = NULL, updated_by = v_actor, updated_at = NOW()
  WHERE id = p_inbound_id;
END;
$$;

CREATE OR REPLACE FUNCTION unpost_outbound(p_outbound_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order outbound_orders%ROWTYPE;
  v_stock warehouse_stock%ROWTYPE;
  v_actor UUID;
  r       RECORD;
BEGIN
  SELECT * INTO v_order FROM outbound_orders WHERE id = p_outbound_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbound order % not found', p_outbound_id USING ERRCODE = 'P0002';
  END IF;
  IF v_order.posted_at IS NULL THEN
    RAISE EXCEPTION 'outbound order % is not posted', v_order.doc_no USING ERRCODE = 'P0003';
  END IF;

  v_actor := COALESCE(p_user_id, v_order.created_by);

  FOR r IN
    SELECT product_id, warehouse_stock_id, warehouse_id, SUM(delta_qty) AS net
    FROM stock_movements
    WHERE doc_type = 'outbound_order' AND doc_id = p_outbound_id AND warehouse_stock_id IS NOT NULL
    GROUP BY product_id, warehouse_stock_id, warehouse_id
    HAVING SUM(delta_qty) <> 0
  LOOP
    SELECT * INTO v_stock FROM warehouse_stock WHERE id = r.warehouse_stock_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'stock row % no longer exists', r.warehouse_stock_id USING ERRCODE = 'P0002';
    END IF;
    -- outbound net is negative → reversal adds stock back; guard stays generic
    IF v_stock.quantity - r.net < 0 THEN
      RAISE EXCEPTION 'cannot unpost %: reversal would make stock % negative',
        v_order.doc_no, v_stock.stock_code USING ERRCODE = 'P0005';
    END IF;

    UPDATE warehouse_stock
    SET quantity = quantity - r.net, updated_by = v_actor, updated_at = NOW()
    WHERE id = v_stock.id;

    INSERT INTO stock_movements (
      product_id, warehouse_stock_id, warehouse_id, delta_qty,
      movement_type, doc_type, doc_id, note, created_by
    ) VALUES (
      r.product_id, r.warehouse_stock_id, r.warehouse_id, -r.net,
      'void', 'outbound_order', p_outbound_id, 'unpost', v_actor
    );

    UPDATE products
    SET current_stock_qty = COALESCE(current_stock_qty, 0) - r.net,
        updated_at = NOW()
    WHERE id = r.product_id;
  END LOOP;

  UPDATE outbound_orders
  SET posted_at = NULL, deducted_at = NULL, updated_by = v_actor, updated_at = NOW()
  WHERE id = p_outbound_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Lock down: clients may not call these directly (service role / API only)
-- ────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION post_inbound(UUID, UUID)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION post_outbound(UUID, UUID)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION unpost_inbound(UUID, UUID)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION unpost_outbound(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION post_inbound(UUID, UUID)    TO service_role;
GRANT EXECUTE ON FUNCTION post_outbound(UUID, UUID)   TO service_role;
GRANT EXECUTE ON FUNCTION unpost_inbound(UUID, UUID)  TO service_role;
GRANT EXECUTE ON FUNCTION unpost_outbound(UUID, UUID) TO service_role;
