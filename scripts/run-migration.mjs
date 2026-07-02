// Run a migration SQL file against the Supabase database
// Usage: node scripts/run-migration.mjs <sql-file>
import { readFileSync } from 'fs'
import pg from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const { Client } = pg
const sqlFile = process.argv[2]
if (!sqlFile) { console.error('Usage: node scripts/run-migration.mjs <sql-file>'); process.exit(1) }

const sql = readFileSync(sqlFile, 'utf8')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL  // https://xxx.supabase.co
const ref = url.replace('https://', '').split('.')[0]

// Try session pooler (ap-southeast-1) — credentials from .env.local
const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 5432,
  user: `postgres.${ref}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  console.log('Connected. Running migration...')
  await client.query(sql)
  console.log('Migration complete.')
} catch (err) {
  console.error('Error:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
