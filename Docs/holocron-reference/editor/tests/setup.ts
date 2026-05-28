// Global vitest setup. Runs once before any test file.
//
// Responsibilities:
//   1. Point HOLOCRON_DB_URI at an isolated test database so the dev `holocron_rag`
//      DB never gets touched. CREATE DATABASE if missing.
//   2. Apply every migration in scripts/migrations/ idempotently.
//   3. Ensure the bridge namespaces (__library__, __inbox__) and a default
//      Domaine row exist (migration 002 seeds them; migration 006 may not).
//   4. Wipe the stub userData dir so saveConfig() snapshots from a prior run
//      don't leak into this one.
//
// Anything else (per-test seeding, TRUNCATE) lives in tests/helpers.ts.

import { afterAll, beforeAll } from 'vitest'
import { Client } from 'pg'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'

const DEFAULT_TEST_DB = 'postgresql://postgres:postgres@localhost:5433/holocron_rag_test'

function adminUriFor(targetUri: string): string {
  // CREATE DATABASE must run on a different DB. Rewrite path to `/postgres`.
  return targetUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1')
}

function dbNameFromUri(uri: string): string {
  const m = uri.match(/\/([^/?]+)(?:\?|$)/)
  if (!m) throw new Error(`Cannot parse db name from URI: ${uri}`)
  return m[1]
}

async function ensureDatabase(targetUri: string): Promise<void> {
  const name = dbNameFromUri(targetUri)
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing CREATE DATABASE for unsafe name: ${name}`)
  }
  const adminUri = adminUriFor(targetUri)
  const admin = new Client({ connectionString: adminUri })
  await admin.connect()
  try {
    const exists = await admin.query<{ exists: number }>(
      'SELECT 1 AS exists FROM pg_database WHERE datname = $1',
      [name],
    )
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${name}`)
    }
  } finally {
    await admin.end()
  }
}

async function runMigrations(targetUri: string): Promise<void> {
  const client = new Client({ connectionString: targetUri })
  await client.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS rag_schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    const migrationsDir = path.resolve(__dirname, '../scripts/migrations')
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const applied = await client.query<{ filename: string }>(
      'SELECT filename FROM rag_schema_migrations',
    )
    const appliedSet = new Set(applied.rows.map((r) => r.filename))

    for (const file of files) {
      if (appliedSet.has(file)) continue
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO rag_schema_migrations (filename) VALUES ($1)',
          [file],
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`)
      }
    }
  } finally {
    await client.end()
  }
}

function wipeUserDataStub(): void {
  // Stub returns this fixed path from electron-stub.ts. Remove its config
  // file so each run starts from DEFAULT_CONFIG semantics.
  const stubDir = path.join(tmpdir(), 'holocron-test-userdata')
  const cfgPath = path.join(stubDir, 'holocron-config.json')
  try { fs.rmSync(cfgPath) } catch { /* missing is fine */ }
}

beforeAll(async () => {
  const testUri = process.env.HOLOCRON_TEST_DB_URI || DEFAULT_TEST_DB
  process.env.HOLOCRON_DB_URI = testUri

  await ensureDatabase(testUri)
  await runMigrations(testUri)
  wipeUserDataStub()
})

afterAll(async () => {
  // Close the lazy pool so vitest can exit cleanly.
  const { closeRagPool } = await import('../src/main/ragDb')
  await closeRagPool()
})
