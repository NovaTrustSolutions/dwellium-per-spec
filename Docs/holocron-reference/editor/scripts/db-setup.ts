import { Client } from 'pg'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { readFileSync, readdirSync } from 'fs'

dotenv.config({ path: resolve(__dirname, '../.env') })

const honchoUri = process.env.DB_CONNECTION_URI
const ragUri = process.env.HOLOCRON_DB_URI

const RAG_TABLES = [
  'rag_documents',
  'rag_tags',
  'rag_document_tags',
  'rag_relationships',
  'rag_wiki_pages',
  'rag_syntheses',
  'rag_operations_log',
  'rag_config',
  'rag_namespaces',
  'rag_wiki_page_sources',
  'foundry_items',
]

async function checkHoncho(): Promise<void> {
  if (!honchoUri) {
    console.log('⚠   DB_CONNECTION_URI not set — skipping Honcho schema check')
    return
  }

  const client = new Client({ connectionString: honchoUri })
  try {
    await client.connect()
  } catch (err) {
    console.log('⚠   Honcho DB unreachable at', honchoUri)
    console.log('   ', err instanceof Error ? err.message : err)
    return
  }
  console.log('✓  Connected to Honcho Postgres')

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector')
    console.log('✓  pgvector extension ready (Honcho DB)')
  } catch {
    console.log('⚠   pgvector not available on Honcho DB — vector search will degrade')
  }

  const result = await client.query<{ exists: string | null }>(
    "SELECT to_regclass('public.workspaces') AS exists"
  )

  if (result.rows[0].exists) {
    console.log('✓  Honcho schema present')
  } else {
    console.log('')
    console.log('⚠   Honcho schema not found. To install, run:')
    console.log('   cd ../memory && uv run alembic upgrade head')
    console.log('   (continuing — Honcho is independent of Holocron RAG setup)')
    console.log('')
  }

  await client.end()
}

function deriveAdminUri(target: string): string {
  // CREATE DATABASE must run on a different DB. Reuse Honcho URI if it's on the
  // same instance (it points at `postgres`); otherwise rewrite the path of the
  // RAG URI to `/postgres`.
  if (honchoUri) return honchoUri
  return target.replace(/\/[^/?]+(\?|$)/, '/postgres$1')
}

function dbNameFromUri(uri: string): string {
  const m = uri.match(/\/([^/?]+)(?:\?|$)/)
  if (!m) throw new Error(`Cannot parse database name from URI: ${uri}`)
  return m[1]
}

async function ensureRagDatabase(): Promise<void> {
  if (!ragUri) {
    console.error('')
    console.error('❌  HOLOCRON_DB_URI not set in editor/.env')
    console.error('   Add this line to editor/.env and re-run:')
    console.error('')
    console.error('   HOLOCRON_DB_URI=postgresql://postgres:postgres@localhost:5432/holocron_rag')
    console.error('')
    process.exit(1)
  }

  const ragDb = dbNameFromUri(ragUri)
  const adminUri = deriveAdminUri(ragUri)

  const admin = new Client({ connectionString: adminUri })
  try {
    await admin.connect()
  } catch (err) {
    console.error('❌  Cannot connect to Postgres admin DB at:', adminUri)
    console.error('   ', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  const exists = await admin.query<{ exists: number }>(
    'SELECT 1 AS exists FROM pg_database WHERE datname = $1',
    [ragDb]
  )

  if (exists.rowCount === 0) {
    // CREATE DATABASE cannot be parameterized; ragDb is read from our own env
    // and matched against ^[A-Za-z0-9_]+$ to defend against accidental injection.
    if (!/^[A-Za-z0-9_]+$/.test(ragDb)) {
      console.error('❌  Refusing to CREATE DATABASE with unsafe name:', ragDb)
      await admin.end()
      process.exit(1)
    }
    await admin.query(`CREATE DATABASE ${ragDb}`)
    console.log(`✓  Created database "${ragDb}"`)
  } else {
    console.log(`✓  Database "${ragDb}" already exists`)
  }

  await admin.end()
}

async function runMigrations(): Promise<void> {
  if (!ragUri) return // already handled in ensureRagDatabase

  const client = new Client({ connectionString: ragUri })
  await client.connect()
  console.log(`✓  Connected to ${dbNameFromUri(ragUri)}`)

  // Bootstrap migration tracking. Idempotent — re-runs are no-ops.
  await client.query(`
    CREATE TABLE IF NOT EXISTS rag_schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  const migrationsDir = resolve(__dirname, 'migrations')
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.log('⚠   No migration files found in', migrationsDir)
    await client.end()
    return
  }

  const applied = await client.query<{ filename: string }>(
    'SELECT filename FROM rag_schema_migrations'
  )
  const appliedSet = new Set(applied.rows.map((r) => r.filename))

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`✓  Migration ${file} already applied`)
      continue
    }
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8')
    console.log(`→  Applying migration ${file}…`)
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO rag_schema_migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`✓  Migration ${file} applied`)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error(`❌  Migration ${file} failed`)
      console.error('   ', err instanceof Error ? err.message : err)
      await client.end()
      process.exit(1)
    }
  }

  // Verify expected application tables exist.
  const placeholders = RAG_TABLES.map((_, i) => `$${i + 1}`).join(', ')
  const found = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN (${placeholders})`,
    RAG_TABLES
  )
  const foundSet = new Set(found.rows.map((r) => r.table_name))
  const missing = RAG_TABLES.filter((t) => !foundSet.has(t))

  if (missing.length === 0) {
    console.log(`✓  All ${RAG_TABLES.length} RAG tables present`)
  } else {
    console.error('❌  Missing tables after migrations:', missing.join(', '))
    await client.end()
    process.exit(1)
  }

  await client.end()
}

async function main(): Promise<void> {
  await checkHoncho()
  await ensureRagDatabase()
  await runMigrations()
  console.log('')
  console.log('✓  DB ready — you can now run: npm run dev')
}

main().catch((err) => {
  console.error('❌  Unexpected error:', err)
  process.exit(1)
})
