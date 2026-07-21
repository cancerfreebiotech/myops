// Rollback-safe verification of the atomic parent+items RPCs
// (migration 20260721000001_procurement_atomic_writes.sql), WITHOUT applying it.
//
// It sends, in ONE transaction: BEGIN → the migration's CREATE FUNCTIONs → a DO
// block that exercises the functions against the REAL schema/tables/triggers and
// RAISEs a 'VERIFY …' summary. The RAISE aborts the transaction, so both the test
// data AND the just-created functions are rolled back — nothing persists, and the
// migration is NOT applied. Uses SUPABASE_ACCESS_TOKEN from .env.local.
//
// Checks: (T1) insert parent+items applies column DEFAULTs + fires the doc_no
// trigger + inserts items; (T2) 'merge' preserves an untouched cache column
// (received_qty), updates a supplied field, prunes a dropped row, inserts a new
// one; (T3) 'replace' deletes all items then re-inserts, and applies the parent patch.
//
// Usage: node scripts/verify-atomic-writes.mjs

import { config } from 'dotenv'
import { readFileSync } from 'fs'
config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!url || !token) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_ACCESS_TOKEN'); process.exit(1) }
const ref = url.replace('https://', '').split('.')[0]
const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`

async function runSql(query) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = null }
  return { ok: res.ok, json, text }
}

const migration = readFileSync('supabase/migrations/20260721000001_procurement_atomic_writes.sql', 'utf8')

const u = await runSql(`SELECT id FROM users WHERE is_active = true LIMIT 1;`)
const uid = u.json?.[0]?.id
if (!uid) { console.error('no active user'); process.exit(1) }

const test = `
BEGIN;
${migration}
DO $test$
DECLARE
  r text := '';
  v jsonb; pr uuid; ib uuid; n int; rq numeric; q numeric;
  item1 uuid; item2 uuid;
BEGIN
  -- T1: PR create with 2 items
  v := procurement_insert_with_items(
    'purchase_requests',
    jsonb_build_object('created_by','${uid}','updated_by','${uid}','requesting_department','__VERIFY__','subtotal',100,'total_amount',105),
    'pr_items','pr_id',
    jsonb_build_array(
      jsonb_build_object('product_name','A','quantity',3,'unit_price',10,'amount',30,'pending_qty',3,'line_no',1),
      jsonb_build_object('product_name','B','quantity',2,'unit_price',5,'amount',10,'pending_qty',2,'line_no',2)
    ));
  pr := (v->>'id')::uuid;
  SELECT count(*) INTO n FROM pr_items WHERE pr_id = pr;
  r := r || format('T1 doc_no=%s status=%s items=%s | ', v->>'doc_no', v->>'status', n);

  -- simulate received progress on item A, then merge-edit
  SELECT id INTO item1 FROM pr_items WHERE pr_id = pr AND product_name='A';
  SELECT id INTO item2 FROM pr_items WHERE pr_id = pr AND product_name='B';
  UPDATE pr_items SET received_qty = 2 WHERE id = item1;

  -- T2: merge — keep A (change quantity, DO NOT send received_qty), drop B, add C
  PERFORM procurement_update_with_items(
    'purchase_requests', pr,
    jsonb_build_object('updated_by','${uid}','total_amount',999),
    'pr_items','pr_id',
    jsonb_build_array(
      jsonb_build_object('id', item1, 'product_name','A','quantity',7,'unit_price',10,'amount',70),
      jsonb_build_object('product_name','C','quantity',1,'unit_price',9,'amount',9,'line_no',3)
    ),
    'merge');
  SELECT count(*) INTO n FROM pr_items WHERE pr_id = pr;
  SELECT received_qty, quantity INTO rq, q FROM pr_items WHERE id = item1;
  r := r || format('T2 items=%s A.received_qty=%s A.quantity=%s Bpresent=%s Cpresent=%s | ',
    n, rq, q,
    (SELECT count(*) FROM pr_items WHERE id = item2),
    (SELECT count(*) FROM pr_items WHERE pr_id = pr AND product_name='C'));
  r := r || format('T2 parent.total_amount=%s | ', (SELECT total_amount FROM purchase_requests WHERE id = pr));

  -- T3: inbound create then 'replace' its items
  v := procurement_insert_with_items(
    'inbound_orders',
    jsonb_build_object('created_by','${uid}','updated_by','${uid}','notes','n1'),
    'inbound_items','inbound_order_id',
    jsonb_build_array(
      jsonb_build_object('product_name','X','quantity',1,'line_no',1),
      jsonb_build_object('product_name','Y','quantity',2,'line_no',2)
    ));
  ib := (v->>'id')::uuid;
  PERFORM procurement_update_with_items(
    'inbound_orders', ib,
    jsonb_build_object('updated_by','${uid}','notes','n2'),
    'inbound_items','inbound_order_id',
    jsonb_build_array(jsonb_build_object('product_name','Z','quantity',5,'line_no',1)),
    'replace');
  SELECT count(*) INTO n FROM inbound_items WHERE inbound_order_id = ib;
  r := r || format('T3 doc_no=%s items_after_replace=%s only=%s notes=%s',
    v->>'doc_no', n,
    (SELECT string_agg(product_name, ',') FROM inbound_items WHERE inbound_order_id = ib),
    (SELECT notes FROM inbound_orders WHERE id = ib));

  RAISE EXCEPTION 'VERIFY %', r;
END $test$;
`

const res = await runSql(test)
const msg = res.json?.message ?? res.json?.error ?? res.text
const m = /VERIFY (.+)/s.exec(msg)
if (m) {
  console.log('\n✅ Functions executed against the real schema (all rolled back):\n')
  console.log(m[1].trim().split(' | ').join('\n'))
  console.log('\nExpected: T1 doc_no=PR-…, status=draft, items=2 | T2 items=2, A.received_qty=2 (preserved), A.quantity=7, Bpresent=0 (pruned), Cpresent=1, total_amount=999 | T3 doc_no=INB-…, items_after_replace=1, only=Z, notes=n2\n')
} else {
  console.log('\n❌ Unexpected result:\n', msg, '\n')
  process.exitCode = 1
}
