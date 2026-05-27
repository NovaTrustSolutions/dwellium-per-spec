import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'

let pool: Pool | null = null

function buildPool(): Pool | null {
  const uri = process.env.HOLOCRON_DB_URI
  if (!uri) return null
  const p = new Pool({ connectionString: uri, max: 4 })
  p.on('error', (err) => {
    console.error('[ragDb] idle client error:', err.message)
  })
  return p
}

/**
 * Lazy accessor to the Holocron RAG Postgres pool. Returns null when
 * HOLOCRON_DB_URI is not configured — callers must handle that gracefully so
 * cost-logging never blocks an LLM call.
 */
export function getRagPool(): Pool | null {
  if (!pool) pool = buildPool()
  return pool
}

export async function ragQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T> | null> {
  const p = getRagPool()
  if (!p) return null
  return p.query<T>(sql, params as never)
}

export async function withRagClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T | null> {
  const p = getRagPool()
  if (!p) return null
  const client = await p.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export async function closeRagPool(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {})
    pool = null
  }
}
