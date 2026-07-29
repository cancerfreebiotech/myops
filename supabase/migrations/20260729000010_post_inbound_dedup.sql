-- ============================================================
-- myOPS — 收貨單轉入庫防重複計庫存（post_inbound 累計入庫量上限）
--
-- 問題（2026-07-23 稽核）：goods_receipt → inbound_order（gr_to_inb）沒有防重，
-- 同一張進貨驗收單可以被重複轉成多張入庫單，全部過帳後庫存被重複計。
--
-- 為什麼不用「一張 GR 只能有一張入庫單」的唯一索引：
--   分批收貨／分批入庫是合法流程（線上已有 15 張 GR 對多張非作廢入庫單），
--   1:1 唯一索引會把正常作業擋死。20260711000020 內被註解掉的
--   uq_inbound_orders_gr_active 因此「刻意維持不套用」。
--
-- 改用「量」而不是「張數」的守門：在 post_inbound（過帳，SECURITY DEFINER）內
-- 檢查同一來源 GR 的累計入庫量，按商品累加不得超過該 GR 的驗收數量。
--   上限（庫存單位）＝ SUM(pr_items.quantity × products.units_per_purchase)
--                     （GR 沒有自己的明細表，驗收明細就是 gr.pr_id 的 pr_items）
--   已用量        ＝ 同一 gr_id 的其他「已過帳」入庫單（posted_at IS NOT NULL）
--                     其 inbound_items 數量按商品累加
--   超過 → RAISE ERRCODE 'P0006'（route 對應成友善訊息），整筆交易回滾。
--
-- 設計要點：
--   * 只算「已過帳」：庫存效果發生在過帳，取消過帳/作廢會清掉 posted_at，
--     額度自動歸還，不需要另寫釋放邏輯；草稿不佔額度（作廢的草稿才不會凍結配額）。
--   * 併發：兩張同 GR 的入庫單各鎖自己的 inbound_orders 列，互不阻擋，
--     會同時讀到「已用量 0」而雙雙通過。因此改以 gr_id 取 advisory 交易鎖序列化。
--   * 找不到上限就不檔（gr_id IS NULL 的手動入庫、GR 沒有 pr_id、
--     或該商品不在 PR 明細上的代品/贈品）—— 維持既有行為，不新增限制。
--   * 行為與回傳型別（VOID）完全不變，只多一道檢查；授權維持只給 service_role。
--
-- 本檔為 additive、可重複執行（CREATE OR REPLACE + 冪等 REVOKE/GRANT）。
-- ============================================================

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
  v_over     RECORD;
  v_gr_no    TEXT;
BEGIN
  SELECT * INTO v_order FROM inbound_orders WHERE id = p_inbound_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inbound order % not found', p_inbound_id USING ERRCODE = 'P0002';
  END IF;
  IF v_order.posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'inbound order % is already posted', v_order.doc_no USING ERRCODE = 'P0003';
  END IF;

  v_actor := COALESCE(p_user_id, v_order.created_by);

  -- ────────────────────────────────────────────────────────────
  -- 防重複計庫存：同一來源 GR 的累計入庫量不得超過驗收數量（按商品）
  -- 在明細迴圈之前做完，任何 warehouse_stock / stock_movements /
  -- next_doc_no 都還沒被動到。
  -- ────────────────────────────────────────────────────────────
  IF v_order.gr_id IS NOT NULL THEN
    -- 同一張 GR 的多筆過帳序列化（各自的 inbound_orders 列鎖擋不到彼此）
    PERFORM pg_advisory_xact_lock(hashtext('post_inbound_gr'), hashtext(v_order.gr_id::TEXT));

    SELECT gr.doc_no INTO v_gr_no FROM goods_receipts gr WHERE gr.id = v_order.gr_id;

    SELECT * INTO v_over FROM (
      WITH this_order AS (
        -- 本單要入的量（同商品跨批號/倉庫的多列先合併）
        SELECT ii.product_id,
               SUM(COALESCE(ii.quantity, 0))                   AS req_qty,
               MIN(COALESCE(ii.product_name, ii.product_code)) AS label,
               MIN(ii.unit)                                    AS unit
        FROM inbound_items ii
        WHERE ii.inbound_order_id = p_inbound_id
          AND ii.product_id IS NOT NULL
        GROUP BY ii.product_id
      ),
      cap AS (
        -- 來源 GR 的驗收數量（採購單位 → 庫存單位）
        -- 用 pr_items.quantity 而非 received_qty/pending_qty：後兩者會被
        -- receipt-progress 隨每次過帳改寫，拿來當上限等於自我放寬。
        SELECT pi.product_id,
               SUM(COALESCE(pi.quantity, 0) * COALESCE(NULLIF(p.units_per_purchase, 0), 1)) AS cap_qty
        FROM goods_receipts gr
        JOIN pr_items pi ON pi.pr_id = gr.pr_id
        LEFT JOIN products p ON p.id = pi.product_id
        WHERE gr.id = v_order.gr_id
          AND pi.product_id IS NOT NULL
        GROUP BY pi.product_id
      ),
      already AS (
        -- 同一 GR 已過帳的其他入庫單（不濾 status：萬一有「已過帳卻已作廢」的
        -- 殘留列，庫存還在，算進來才是安全方向）
        SELECT ii.product_id, SUM(COALESCE(ii.quantity, 0)) AS posted_qty
        FROM inbound_orders io
        JOIN inbound_items ii ON ii.inbound_order_id = io.id
        WHERE io.gr_id = v_order.gr_id
          AND io.id <> p_inbound_id
          AND io.posted_at IS NOT NULL
          AND ii.product_id IS NOT NULL
        GROUP BY ii.product_id
      )
      SELECT COALESCE(t.label, t.product_id::TEXT)               AS label,
             COALESCE(t.unit, '')                                AS unit,
             t.req_qty                                           AS req_qty,
             c.cap_qty                                           AS cap_qty,
             COALESCE(a.posted_qty, 0)                           AS posted_qty,
             GREATEST(c.cap_qty - COALESCE(a.posted_qty, 0), 0)  AS remaining_qty
      FROM this_order t
      -- INNER JOIN：沒有上限可比的商品（不在 PR 明細上）不檔
      JOIN cap c ON c.product_id = t.product_id
      LEFT JOIN already a ON a.product_id = t.product_id
      -- 1e-6 容差：數量在應用層以浮點算出（尚未進貨量 × 換算率），
      -- 避免尾差誤判；真正的重複轉單量級遠大於此。
      WHERE COALESCE(a.posted_qty, 0) + t.req_qty > c.cap_qty + 0.000001
      ORDER BY (COALESCE(a.posted_qty, 0) + t.req_qty - c.cap_qty) DESC
      LIMIT 1
    ) q;

    IF FOUND THEN
      RAISE EXCEPTION
        'inbound order %: product % cumulative inbound exceeds goods receipt % quantity (already posted %, this document %, receipt %)',
        v_order.doc_no, v_over.label, COALESCE(v_gr_no, v_order.gr_id::TEXT),
        v_over.posted_qty, v_over.req_qty, v_over.cap_qty
        USING ERRCODE = 'P0006',
              DETAIL = FORMAT('goods receipt %s allows %s %s in total for this product',
                              COALESCE(v_gr_no, v_order.gr_id::TEXT), v_over.cap_qty, v_over.unit),
              -- 機器可讀的補充放 HINT（PostgREST 會原樣轉成 error.hint）。
              -- 刻意不放 DETAIL：PostgREST 的自訂回應機制會去解析 message/detail，
              -- HINT 不在那條路徑上，最不會被誤讀。route 端解析失敗就退回通用訊息。
              HINT = json_build_object(
                'item', v_over.label,
                'unit', v_over.unit,
                'remaining', v_over.remaining_qty,
                'requested', v_over.req_qty,
                'receiptQty', v_over.cap_qty,
                'postedQty', v_over.posted_qty,
                'grDocNo', v_gr_no
              )::TEXT;
    END IF;
  END IF;

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

-- 加速上限計算（同 gr_id 的已過帳入庫單查詢）
CREATE INDEX IF NOT EXISTS idx_inbound_orders_gr_posted
  ON inbound_orders (gr_id)
  WHERE gr_id IS NOT NULL AND posted_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 授權（CREATE OR REPLACE 保留既有 ACL，但重播到全新 DB 時
-- Supabase 的 public schema 預設授權會 GRANT 給 anon/authenticated，
-- 因此照 20260612000011 的收尾再宣告一次）
-- ────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION post_inbound(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION post_inbound(UUID, UUID) TO service_role;
