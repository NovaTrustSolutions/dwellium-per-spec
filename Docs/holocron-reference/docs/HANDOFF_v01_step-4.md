# Handoff — Phase 3a Step 4 (`llmClient.ts` + cost middleware)

**To:** the next Claude session
**From:** prior session 2026-05-07 (shipped step 1 — Postgres schema)
**You are starting:** Phase 3a Step 4 (LLM client abstraction + cost-tracking middleware)

---

## Read order (10-15 min total)

1. **`docs/STATUS.md`** — current project state.
2. **`docs/phase-3a-execution.md`** — your build spec for this phase. **Settled decisions are settled** (single Postgres / two DBs, no pgvector, no OpenAI, bullmq + in-process worker, 2s idle gate, three providers). Don't relitigate.
3. **`docs/phase-3a-execution.md` §"Settled decisions" item 4 + §"Step 4"** — the exact `ChatRequest` / `ChatResponse` interface and adapter shapes you're building.
4. **`docs/gotcha.md`** — debugging discipline. Re-read before any 2+ turn debugging session.

You do **not** need to read the rest of `architecture-v3.md` for step 4. It's pure backend plumbing.

---

## What just shipped (step 1, this commit)

- **`editor/scripts/migrations/001_rag_schema.sql`** — full RAG schema verbatim from `architecture-v3.md` §"Database schema." 8 tables, 6 explicit indexes, 2 unique constraints, generated `tsvector` column on `rag_documents`. Idempotent (`CREATE TABLE IF NOT EXISTS`).
- **`editor/scripts/db-setup.ts`** — extended:
  - Honcho schema check is now a **warning** (was `process.exit(1)`). Honcho is independent of RAG setup.
  - Creates `holocron_rag` database from the admin connection (`DB_CONNECTION_URI`), reconnects to it, applies the migration, verifies all 8 tables.
  - DB name is regex-validated (`^[A-Za-z0-9_]+$`) before interpolation since `CREATE DATABASE` can't be parameterized.
- Verified working: `npm run db:setup` is idempotent. Tables and indexes confirmed via `docker exec holocron_link-database-1 psql -U postgres -d holocron_rag -c '\dt'`.

**`HOLOCRON_DB_URI` is NOT yet in `editor/.env`.** Andy will paste this line at his convenience:

```
HOLOCRON_DB_URI=postgresql://postgres:postgres@localhost:5432/holocron_rag
```

The script reads from `process.env.HOLOCRON_DB_URI`. **Step 4 needs it set before running anything that touches the RAG DB** (e.g. cost-log writes). If Andy hasn't pasted it yet, prompt him before testing the cost middleware.

---

## Your job: Step 4 — `llmClient.ts` + cost middleware

**Goal:** every cloud LLM call in the app routes through one entry point that (a) translates to provider-specific format, (b) logs an `rag_operations_log` row with token counts and USD cost, (c) checks budget before spending. Existing chat flows (Gemini Flash, LM Studio) keep working without renderer-side changes.

**Files you'll touch:**
- `editor/src/main/llmClient.ts` — NEW. The unified entry point.
- `editor/src/main/ipc.ts` — refactor existing `lm:start` and `lm:complete` handlers to delegate to `llmClient.chat()`.
- (Maybe) a small `editor/src/main/db.ts` or similar for the RAG-DB pool, since `llmClient` needs to write to `rag_operations_log` and step 3 will reuse the same pool. Decide based on how clean the import graph stays — fine to inline a `pg.Pool` in `llmClient.ts` for now and extract later.

**Interface (verbatim from phase-3a-execution.md §4):**

```ts
type Provider = 'gemini' | 'anthropic' | 'lmstudio'

interface ChatRequest {
  provider: Provider
  model: string
  apiKey?: string
  baseUrl?: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
  stream?: boolean
  task?: string   // 'tag-extract', 'wikilink-insert', 'synthesis-essay', etc.
}

interface ChatResponse {
  content: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  error?: string
}
```

**Adapter shapes:**
- `geminiAdapter` and `lmstudioAdapter` — OpenAI-compatible endpoint format (existing pattern in `ipc.ts`'s `lm:start`/`lm:complete`).
- `anthropicAdapter` — Anthropic native format. **Pull all `system`-role messages out of `messages`, concatenate, send as top-level `system` parameter.** Only `user`/`assistant` go in the `messages` array. Endpoint: `POST https://api.anthropic.com/v1/messages`. Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. (Step 5 will exercise this; do the wiring in step 4.)

**Cost middleware:**
- `withCostLog(provider, task, fn)` wraps a call, measures latency, logs to `rag_operations_log` (operation: `'query'`, target_id null for chat, details JSONB with model + task + token counts).
- LM Studio bypasses cost logging entirely (zero cost — don't fabricate pseudo-costs).
- Price table (constants in this file, update annually):
  - Gemini Flash: input $0.075/M, output $0.30/M
  - Claude Sonnet 4.6: input $3/M, output $15/M
  - LM Studio: $0

**Budget pre-check:**
- `checkBudget(): Promise<{ allowed: boolean; spentToday: number; limit: number }>`
- Reads daily spend from `rag_operations_log` (`SELECT SUM(cost_usd) WHERE created_at >= date_trunc('day', NOW())`).
- Limit + hard-stop flag from `rag_config` (key `daily_budget_usd`, key `budget_hard_stop`). Defaults: $5/day, hard-stop OFF. Insert defaults on first call if missing.
- If hard-stop ON and over → throw before the cloud call.

**Refactor:** existing `lm:start` and `lm:complete` IPC handlers in `ipc.ts` move their fetch logic into `llmClient.chat()`. The renderer (`useLMStream.ts`) MUST keep working unchanged — it consumes the IPC, not the internal API.

---

## Definition of done

- All existing chat flows still work. **Regression test these manually:**
  - Plain chat in editor (Gemini Flash) → still streams.
  - Cmd+L redline detection → still detects + creates yellow widgets.
  - Brain dump → chat → still works.
  - "Address all comments" silent button → still works.
  - LM Studio mode (toggle in Settings → Connections → AI Model) → still streams.
- A new `rag_operations_log` row appears per chat send. Verify:
  ```
  docker exec holocron_link-database-1 psql -U postgres -d holocron_rag \
    -c "SELECT operation, provider, cost_usd, created_at FROM rag_operations_log ORDER BY created_at DESC LIMIT 5"
  ```
- Anthropic adapter compiles + has correct request shape (don't need a real API key to verify the shape; mock or just inspect the constructed fetch payload via a temporary log).
- `checkBudget()` returns `{ allowed: true, spentToday: 0, limit: 5 }` on a fresh log.
- `npm run typecheck` passes.

**Stop after step 4.** Don't barrel into step 5 (Anthropic actual usage) — that needs the API key Andy will paste later. Each step gets a fresh agent.

---

## Things settled — DO NOT re-design these

From `phase-3a-execution.md`:

1. **Single Postgres instance, two databases.** RAG = `holocron_rag`. Honcho = `postgres`.
2. **No pgvector.** Level 4 only.
3. **No OpenAI provider.** Three providers: gemini, anthropic, lmstudio.
4. **bullmq + in-process worker** for ingestion (step 3, not your problem).
5. **2-second idle gate** on file changes (step 3).
6. **`llmClient.ts` abstraction with three providers** ← this is what you're building.
7. **Anthropic uses native REST API directly**, not the SDK npm package.

If a future requirement *seems* to push back on any of these, surface to Andy before changing.

---

## Gotchas discovered during step 1

- **No `psql` on the host machine.** Use `docker exec -e PGPASSWORD=postgres holocron_link-database-1 psql -U postgres -d holocron_rag ...` to inspect. The container name is `holocron_link-database-1` (from `memory/docker-compose.yml`).
- **`pg` client can't parameterize `CREATE DATABASE`.** If you ever need this again, validate the DB name with a regex before interpolation. (Already done in `db-setup.ts`.)
- **`gen_random_uuid()` requires `pgcrypto`**, not `uuid-ossp`. Migration creates it at the top.
- **The Postgres image is `pgvector/pgvector:pg15`**, so the `vector` extension *is* available — Honcho uses it. Holocron RAG deliberately doesn't. Don't accidentally `CREATE EXTENSION vector` on `holocron_rag`.
- **Empty `.env` lines matter.** `editor/.env` is 73 bytes, contains `DB_CONNECTION_URI=...` only. Andy will add `HOLOCRON_DB_URI=...` himself.

---

## Confirmed running infrastructure

```
Postgres   localhost:5432   pgvector/pgvector:pg15   container holocron_link-database-1
Redis      localhost:6379   redis:8.2                container holocron_link-redis-1
Honcho     localhost:8000   custom build             containers holocron_link-api-1 + deriver-1
```

Up 6+ days as of 2026-05-07. Don't waste time verifying unless something fails.

---

## Context budget guidance

Step 4 is medium (~25-35% of context). After you ship it, **stop.** Update this `_HANDOFF.md` with: what you shipped, the next agent's job (probably step 5: Anthropic SDK + Settings UI), any new gotchas. Tell Andy: "Step 4 done. Recommend `/clear` and start step 5 next (needs your Anthropic API key)."

---

## Open questions you might hit (and the right answer)

- **"Should I use the Anthropic SDK npm package?"** No. Native REST is simpler and one less dep. Per phase-3a-execution.md §5.
- **"Should I add streaming for Anthropic now?"** Yes — wire the SSE parsing in step 4 since the interface includes `stream?: boolean`. Step 5 just connects the UI to it.
- **"Where do I put the `pg.Pool` for `rag_operations_log` writes?"** Either inline in `llmClient.ts` or a tiny `editor/src/main/ragDb.ts`. Either is fine; step 3 (ingestion) will use the same pool, so a shared module is slightly cleaner. Use your judgment.
- **"Should I write a unit test?"** No. Manual regression checklist (above) is enough for v1. Andy can add Vitest later if he wants.

---

## If something goes wrong

Per `gotcha.md`: **observe before patching.** If a cost-log insert fails, print the actual Postgres error (likely a missing column or wrong type). Don't add hopeful retries.

If `useLMStream` breaks after the refactor, the symptom is renderer-side — open Electron DevTools (Cmd+Opt+I), look for `[lmStart]`-style logs and IPC errors. Don't chase a phantom bug in `llmClient.ts` if the failure is renderer-side.

Don't bundle speculative fixes. One log, one hypothesis, one change.

---

**Current branch:** `main`. **Latest commit (top of branch as of handoff write):** the step 1 commit (check `git log -3`).

**You're cleared to begin step 4.** Good luck.
