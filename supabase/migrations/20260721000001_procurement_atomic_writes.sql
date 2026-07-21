-- Atomic parent+items writes for procurement documents.
--
-- WHY: every procurement create/edit today writes the header and its line items
-- as SEPARATE PostgREST calls (insert parent → insert items, or delete items →
-- insert items → update header). PostgREST has no cross-statement transaction, so
-- a failure between steps leaves orphan headers (burned doc_no) or — worst — the
-- inbound/outbound "replace-all" edit can DELETE all items then fail the re-insert,
-- losing the line items entirely; the PR edit does an N-step diff with no rollback.
--
-- These two SECURITY DEFINER functions perform the whole parent+items mutation in
-- ONE function transaction, so it is all-or-nothing. They are generic (table names
-- + jsonb payloads) so one definition serves purchase_requests/pr_items,
-- inbound_orders/inbound_items, outbound_orders/outbound_items (and future docs).
--
-- SECURITY: identical posture to the rest of the procurement write path — the app
-- authorizes (requireProcurementUser / requireInventoryUser / draft-only / ownership)
-- and calls these ONLY via procurementWriteClient() (true service role). EXECUTE is
-- revoked from anon/authenticated and granted to service_role only, mirroring the
-- posting RPCs in 20260612000011. SECURITY DEFINER + search_path=public lets the
-- internal writes bypass the SELECT-only RLS on the procurement tables exactly like
-- the write client does, and the BEFORE INSERT doc_no trigger still fires (payloads
-- omit doc_no → next_doc_no fills it).
--
-- KEY CORRECTNESS RULE (the NULL-vs-DEFAULT trap): we INSERT/UPDATE only the keys
-- PRESENT in the jsonb payload that are REAL columns of the table. A blanket
-- `INSERT ... SELECT * FROM jsonb_populate_record(NULL::tbl,payload)` would write
-- NULL over every unset column, nulling the PK/id, created_at, status DEFAULT,
-- received_qty DEFAULT, is_new_lot DEFAULT, and defeating the doc_no trigger. The
-- present-keys idiom below preserves all column defaults and the trigger.

-- ── helper: real column names of a public table, as a set ────────────────────
CREATE OR REPLACE FUNCTION _proc_table_columns(p_table text)
RETURNS TABLE(column_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.column_name::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = p_table
$$;

-- ── helper: INSERT one jsonb object into a table using only present real columns ─
CREATE OR REPLACE FUNCTION _proc_insert_row(p_table text, p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cols text;
  v_sel  text;
  v_out  jsonb;
BEGIN
  SELECT string_agg(quote_ident(k), ', '),
         string_agg('r.' || quote_ident(k), ', ')
    INTO v_cols, v_sel
  FROM jsonb_object_keys(p_row) AS k
  WHERE k IN (SELECT column_name FROM _proc_table_columns(p_table));

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'procurement write: no valid columns for table % in payload %', p_table, p_row
      USING ERRCODE = 'P0100';
  END IF;

  EXECUTE format(
    'INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_record(NULL::%I, $1) r RETURNING to_jsonb(%I.*)',
    p_table, v_cols, v_sel, p_table, p_table
  ) USING p_row INTO v_out;

  RETURN v_out;
END $$;

-- ── helper: UPDATE one row (by id + fk) using only present real columns (never id/fk) ─
CREATE OR REPLACE FUNCTION _proc_update_row(p_table text, p_id uuid, p_fk_column text, p_row jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_set text;
BEGIN
  SELECT string_agg(quote_ident(k) || ' = r.' || quote_ident(k), ', ')
    INTO v_set
  FROM jsonb_object_keys(p_row) AS k
  WHERE k IN (SELECT column_name FROM _proc_table_columns(p_table))
    AND k <> 'id'
    AND (p_fk_column IS NULL OR k <> p_fk_column);

  IF v_set IS NULL THEN RETURN; END IF; -- nothing to update

  EXECUTE format(
    'UPDATE %I t SET %s FROM jsonb_populate_record(NULL::%I, $1) r WHERE t.id = $2',
    p_table, v_set, p_table
  ) USING p_row, p_id;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- FUNCTION 1 — insert parent + its items atomically.
-- Covers: PR create, inbound create, outbound create, void-clone, gr→inb conversion.
-- Returns to_jsonb(parent.*) so the caller reads back the trigger-generated doc_no/id.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION procurement_insert_with_items(
  p_parent_table text,
  p_parent       jsonb,
  p_item_table   text  DEFAULT NULL,
  p_fk_column    text  DEFAULT NULL,
  p_items        jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent jsonb;
  v_id     uuid;
  v_item   jsonb;
BEGIN
  v_parent := _proc_insert_row(p_parent_table, p_parent);
  v_id := (v_parent->>'id')::uuid;

  IF p_item_table IS NOT NULL AND jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) > 0 THEN
    IF p_fk_column IS NULL THEN
      RAISE EXCEPTION 'procurement_insert_with_items: p_fk_column required when p_items given'
        USING ERRCODE = 'P0100';
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      PERFORM _proc_insert_row(p_item_table, v_item || jsonb_build_object(p_fk_column, v_id));
    END LOOP;
  END IF;

  RETURN v_parent;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- FUNCTION 2 — update parent + sync its items atomically.
-- p_sync_mode = 'replace' : delete all items for the parent, insert p_items
--                           (inbound/outbound edit).
-- p_sync_mode = 'merge'   : id-keyed reconcile (PR edit) — delete the parent's
--                           rows whose id is NOT in the payload; UPDATE payload
--                           rows that carry an id (only present keys, so a cache
--                           column like pr_items.received_qty left out of the
--                           payload is PRESERVED); INSERT payload rows with no id.
-- The parent patch (recomputed totals / is_new_lot / updated_by …) is applied last.
-- Returns to_jsonb(parent.*).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION procurement_update_with_items(
  p_parent_table text,
  p_parent_id    uuid,
  p_parent_patch jsonb,
  p_item_table   text,
  p_fk_column    text,
  p_items        jsonb,
  p_sync_mode    text DEFAULT 'replace'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb;
  v_keep uuid[];
  v_set  text;
  v_out  jsonb;
BEGIN
  IF p_sync_mode = 'replace' THEN
    EXECUTE format('DELETE FROM %I WHERE %I = $1', p_item_table, p_fk_column) USING p_parent_id;
    IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) > 0 THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        PERFORM _proc_insert_row(p_item_table, v_item || jsonb_build_object(p_fk_column, p_parent_id));
      END LOOP;
    END IF;

  ELSIF p_sync_mode = 'merge' THEN
    SELECT array_agg((e->>'id')::uuid) INTO v_keep
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
    WHERE e ? 'id' AND NULLIF(e->>'id', '') IS NOT NULL;

    -- prune rows removed from the payload
    EXECUTE format('DELETE FROM %I WHERE %I = $1 AND ($2 IS NULL OR id <> ALL($2))', p_item_table, p_fk_column)
      USING p_parent_id, v_keep;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
      IF v_item ? 'id' AND NULLIF(v_item->>'id', '') IS NOT NULL THEN
        PERFORM _proc_update_row(p_item_table, (v_item->>'id')::uuid, p_fk_column, v_item);
      ELSE
        PERFORM _proc_insert_row(p_item_table, v_item || jsonb_build_object(p_fk_column, p_parent_id));
      END IF;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'procurement_update_with_items: invalid p_sync_mode %', p_sync_mode
      USING ERRCODE = 'P0100';
  END IF;

  -- parent patch (present real columns only), returning the updated row
  SELECT string_agg(quote_ident(k) || ' = r.' || quote_ident(k), ', ')
    INTO v_set
  FROM jsonb_object_keys(p_parent_patch) AS k
  WHERE k IN (SELECT column_name FROM _proc_table_columns(p_parent_table)) AND k <> 'id';

  IF v_set IS NULL THEN
    EXECUTE format('SELECT to_jsonb(t.*) FROM %I t WHERE t.id = $1', p_parent_table)
      USING p_parent_id INTO v_out;
  ELSE
    EXECUTE format(
      'UPDATE %I t SET %s FROM jsonb_populate_record(NULL::%I, $1) r WHERE t.id = $2 RETURNING to_jsonb(t.*)',
      p_parent_table, v_set, p_parent_table
    ) USING p_parent_patch, p_parent_id INTO v_out;
  END IF;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'procurement_update_with_items: parent % not found in %', p_parent_id, p_parent_table
      USING ERRCODE = 'P0101';
  END IF;

  RETURN v_out;
END $$;

-- ── grants: service_role only (called via procurementWriteClient), mirror 20260612000011 ─
REVOKE ALL ON FUNCTION _proc_table_columns(text)                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _proc_insert_row(text, jsonb)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _proc_update_row(text, uuid, text, jsonb)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurement_insert_with_items(text, jsonb, text, text, jsonb)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procurement_update_with_items(text, uuid, jsonb, text, text, jsonb, text)  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION procurement_insert_with_items(text, jsonb, text, text, jsonb)             TO service_role;
GRANT EXECUTE ON FUNCTION procurement_update_with_items(text, uuid, jsonb, text, text, jsonb, text) TO service_role;
-- (_proc_* helpers are SECURITY DEFINER and only reachable from the two public fns, which are service_role-only.)
