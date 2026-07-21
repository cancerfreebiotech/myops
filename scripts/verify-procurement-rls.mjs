// Rollback-safe verification of the procurement RLS write fix.
//
// Proves — WITHOUT persisting any data — the mechanism behind the
// createServiceClient()→procurementWriteClient() fix:
//
//   1. As role `authenticated` (what the mis-named createServiceClient() ran as,
//      because it carried the user's JWT): writes to the procurement tables are
//      rejected — INSERT → SQLSTATE 42501, UPDATE → 0 rows silently.
//   2. As role `service_role` (what procurementWriteClient() now runs as; it has
//      BYPASSRLS, exactly like PostgREST called with the service key): the same
//      INSERT/UPDATE succeed.
//
// So the app-code change (verified separately by `npm run build`) is what makes
// the writes work — this script proves the two roles behave as the fix assumes.
//
// HOW IT STAYS SAFE: each check runs inside `BEGIN; SET LOCAL ROLE …; DO $$ …
// RAISE EXCEPTION 'VERIFY …' $$;`. The RAISE aborts the transaction, so the
// INSERT/UPDATE is ALWAYS rolled back — but its outcome (SQLSTATE / row count)
// is carried out in the exception message, which the API returns. Nothing commits.
//
// Runs against the project via the Supabase Management API using
// SUPABASE_ACCESS_TOKEN from .env.local (credentials read from env, never inlined).
//
// Usage: node scripts/verify-procurement-rls.mjs

import { config } from 'dotenv'
config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!url || !token) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_ACCESS_TOKEN in .env.local')
  process.exit(1)
}
const ref = url.replace('https://', '').split('.')[0]
const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`

/** Run arbitrary SQL via the Management API. Returns { rows, error } where error
 *  is the API/Postgres error message string (if any). */
async function runSql(query) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? text
    return { rows: null, error: String(msg) }
  }
  return { rows: json, error: null }
}

let failures = 0
function record(name, pass, detail) {
  if (!pass) failures++
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name} — ${detail}`)
}

/** A check that expects a `VERIFY <marker>` to come back in the error message. */
async function verifyMarker(name, sql, expectedMarker, describe) {
  const { error } = await runSql(sql)
  const marker = error && /VERIFY\s+(\S+)/.exec(error)?.[1]
  const ok = marker === expectedMarker
  record(name, ok, ok ? describe(marker) : `got: ${error ?? 'no error / unexpected success'}`)
}

// SET LOCAL ROLE is transaction-scoped; the RAISE EXCEPTION rolls the whole tx back.
const asRole = (role, body) =>
  `BEGIN; SET LOCAL ROLE ${role}; DO $$ DECLARE n int; BEGIN ${body} END $$;`

try {
  // A real, existing user id — satisfies rfqs.created_by/updated_by FKs. RLS denial
  // for a missing policy does not depend on which user, so any active user works.
  const u = await runSql(`SELECT id FROM users WHERE is_active = true LIMIT 1;`)
  if (u.error || !u.rows?.length) throw new Error(`could not fetch a user: ${u.error ?? 'none'}`)
  const uid = u.rows[0].id

  const ve = await runSql(`SELECT id FROM vendor_evaluations LIMIT 1;`)
  const veId = ve.rows?.[0]?.id ?? null

  console.log(`\nProject ${ref} — user ${uid}${veId ? `, vendor_evaluation ${veId}` : ' (no vendor_evaluations row for UPDATE test)'}\n`)

  // 1a. authenticated INSERT rfqs → expect 42501 (caught inside the DO block)
  await verifyMarker(
    'authenticated INSERT rfqs is BLOCKED (42501)',
    asRole('authenticated', `
      INSERT INTO rfqs (created_by, updated_by) VALUES ('${uid}','${uid}');
      RAISE EXCEPTION 'VERIFY UNEXPECTED_SUCCESS';
      EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'VERIFY blocked_42501';`),
    'blocked_42501',
    () => 'INSERT rejected by RLS as expected'
  )

  // 2a. service_role INSERT rfqs → expect success (row count 1)
  await verifyMarker(
    'service_role INSERT rfqs SUCCEEDS',
    asRole('service_role', `
      INSERT INTO rfqs (created_by, updated_by) VALUES ('${uid}','${uid}');
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE EXCEPTION 'VERIFY rows=%', n;`),
    'rows=1',
    (m) => `INSERT succeeded (${m}), then rolled back`
  )

  if (veId) {
    // 1b. authenticated UPDATE vendor_evaluations → expect 0 rows (silent)
    await verifyMarker(
      'authenticated UPDATE vendor_evaluations affects 0 rows (silent)',
      asRole('authenticated', `
        UPDATE vendor_evaluations SET updated_at = now() WHERE id = '${veId}';
        GET DIAGNOSTICS n = ROW_COUNT;
        RAISE EXCEPTION 'VERIFY rows=%', n;`),
      'rows=0',
      (m) => `UPDATE silently affected ${m} (no error) — the dangerous class`
    )

    // 2b. service_role UPDATE vendor_evaluations → expect 1 row
    await verifyMarker(
      'service_role UPDATE vendor_evaluations SUCCEEDS',
      asRole('service_role', `
        UPDATE vendor_evaluations SET updated_at = now() WHERE id = '${veId}';
        GET DIAGNOSTICS n = ROW_COUNT;
        RAISE EXCEPTION 'VERIFY rows=%', n;`),
      'rows=1',
      (m) => `UPDATE succeeded (${m}), then rolled back`
    )
  }

  console.log(`\n${failures === 0 ? '✅ All checks passed' : `❌ ${failures} check(s) failed`} — no data persisted (every tx aborted/rolled back).\n`)
  if (failures > 0) process.exitCode = 1
} catch (err) {
  console.error('Error:', err.message)
  process.exitCode = 1
}
