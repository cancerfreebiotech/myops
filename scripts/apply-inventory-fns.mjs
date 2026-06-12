// One-off: apply 20260612000011_procurement_inventory_fns.sql to prod,
// then smoke-test post→unpost with fake data inside a rolled-back transaction.
// Usage: node scripts/apply-inventory-fns.mjs
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const password = env.match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim()
if (!password) { console.error('SUPABASE_DB_PASSWORD not found in .env.local'); process.exit(1) }

const HOST = 'aws-1-ap-northeast-1.pooler.supabase.com'
const USER = 'postgres.odzwvkhdrahomgqwlwba'
const PORTS = [5432, 6543]

async function connect() {
  let lastErr
  for (let round = 0; round < 6; round++) {
    for (const port of PORTS) {
      const sql = postgres({
        host: HOST, port, user: USER, password, database: 'postgres',
        ssl: 'require', prepare: false, max: 1, connect_timeout: 20,
      })
      try {
        await sql`SELECT 1`
        console.log(`connected on port ${port} (round ${round + 1})`)
        return sql
      } catch (e) {
        lastErr = e
        console.error(`port ${port} round ${round + 1} failed: ${e.message}`)
        await sql.end({ timeout: 1 }).catch(() => {})
      }
    }
    await new Promise(r => setTimeout(r, 10_000))
  }
  throw lastErr
}

const sql = await connect()

// ── 1. apply migration ──────────────────────────────────────
const migration = readFileSync(new URL('../supabase/migrations/20260612000011_procurement_inventory_fns.sql', import.meta.url), 'utf8')
await sql.unsafe(migration)
console.log('migration applied ✓')

// ── 2. smoke test post→unpost (fake data, ROLLBACK at the end) ──
try {
  await sql.begin(async tx => {
    const [{ id: uid }] = await tx`SELECT id FROM users WHERE is_active = TRUE LIMIT 1`
    const [wh] = await tx`INSERT INTO warehouses (code, name) VALUES ('__TEST_WH', '__test warehouse') RETURNING id`
    const [prod] = await tx`INSERT INTO products (product_code, name, stock_unit, units_per_purchase)
                            VALUES ('__TESTP', '__test product', '瓶', 12) RETURNING id`
    // existing lot to be incremented
    const [existing] = await tx`INSERT INTO warehouse_stock (warehouse_id, product_id, stock_code, lot_no, quantity)
                                VALUES (${wh.id}, ${prod.id}, '__TESTSTK', 'LOT-A', 10) RETURNING id`
    const [inb] = await tx`INSERT INTO inbound_orders (created_by) VALUES (${uid}) RETURNING id, doc_no`
    await tx`INSERT INTO inbound_items (inbound_order_id, line_no, product_id, warehouse_id, lot_no, quantity)
             VALUES (${inb.id}, 1, ${prod.id}, ${wh.id}, 'LOT-A', 5),
                    (${inb.id}, 2, ${prod.id}, ${wh.id}, 'LOT-B', 7)`

    await tx`SELECT post_inbound(${inb.id}, ${uid})`
    const stocks = await tx`SELECT lot_no, quantity, stock_code FROM warehouse_stock WHERE product_id = ${prod.id} ORDER BY lot_no`
    console.log('after post_inbound:', JSON.stringify(stocks))
    if (Number(stocks.find(s => s.lot_no === 'LOT-A').quantity) !== 15) throw new Error('LOT-A should be 15')
    const lotB = stocks.find(s => s.lot_no === 'LOT-B')
    if (Number(lotB.quantity) !== 7 || !/^STK-\d{4}-\d{3}$/.test(lotB.stock_code)) throw new Error('LOT-B new lot wrong: ' + JSON.stringify(lotB))
    const [{ current_stock_qty }] = await tx`SELECT current_stock_qty FROM products WHERE id = ${prod.id}`
    if (Number(current_stock_qty) !== 12) throw new Error('product cache should be 12, got ' + current_stock_qty)

    // double-post must fail
    let dup = false
    try { await tx.savepoint(s => s`SELECT post_inbound(${inb.id}, ${uid})`) } catch { dup = true }
    if (!dup) throw new Error('double post_inbound did not fail')
    console.log('double-post blocked ✓')

    // outbound: take 6 from LOT-A
    const [out] = await tx`INSERT INTO outbound_orders (created_by) VALUES (${uid}) RETURNING id`
    await tx`INSERT INTO outbound_items (outbound_order_id, line_no, product_id, warehouse_stock_id, used_qty)
             VALUES (${out.id}, 1, ${prod.id}, ${existing.id}, 6)`
    await tx`SELECT post_outbound(${out.id}, ${uid})`
    const [lotA] = await tx`SELECT quantity FROM warehouse_stock WHERE id = ${existing.id}`
    if (Number(lotA.quantity) !== 9) throw new Error('LOT-A after outbound should be 9, got ' + lotA.quantity)
    const [oi] = await tx`SELECT warehouse_qty, qty_after_use FROM outbound_items WHERE outbound_order_id = ${out.id}`
    console.log('outbound snapshots:', JSON.stringify(oi))

    // insufficient stock must fail
    const [out2] = await tx`INSERT INTO outbound_orders (created_by) VALUES (${uid}) RETURNING id`
    await tx`INSERT INTO outbound_items (outbound_order_id, line_no, product_id, warehouse_stock_id, used_qty)
             VALUES (${out2.id}, 1, ${prod.id}, ${existing.id}, 999)`
    let insuff = false
    try { await tx.savepoint(s => s`SELECT post_outbound(${out2.id}, ${uid})`) } catch (e) { insuff = /insufficient/.test(e.message); if (!insuff) throw e }
    if (!insuff) throw new Error('insufficient-stock outbound did not fail')
    console.log('insufficient stock blocked ✓')

    // unpost both, expect LOT-A back to 10, LOT-B to 0, cache back to 0
    await tx`SELECT unpost_outbound(${out.id}, ${uid})`
    await tx`SELECT unpost_inbound(${inb.id}, ${uid})`
    const after = await tx`SELECT lot_no, quantity FROM warehouse_stock WHERE product_id = ${prod.id} ORDER BY lot_no`
    console.log('after unpost:', JSON.stringify(after))
    if (Number(after.find(s => s.lot_no === 'LOT-A').quantity) !== 10) throw new Error('LOT-A should revert to 10')
    if (Number(after.find(s => s.lot_no === 'LOT-B').quantity) !== 0) throw new Error('LOT-B should revert to 0')
    const [{ current_stock_qty: cacheAfter }] = await tx`SELECT current_stock_qty FROM products WHERE id = ${prod.id}`
    if (Number(cacheAfter) !== 0) throw new Error('product cache should revert to 0, got ' + cacheAfter)
    const movements = await tx`SELECT movement_type, delta_qty FROM stock_movements WHERE product_id = ${prod.id} ORDER BY created_at`
    console.log('ledger:', JSON.stringify(movements))
    const [io] = await tx`SELECT posted_at, stocked_at FROM inbound_orders WHERE id = ${inb.id}`
    if (io.posted_at !== null) throw new Error('posted_at not cleared')

    console.log('smoke test passed ✓ — rolling back')
    throw new Error('__ROLLBACK__')
  })
} catch (e) {
  if (e.message !== '__ROLLBACK__') throw e
}
console.log('rolled back ✓ (no fake data persisted)')
await sql.end()
