# Phase 3a — Execution Plan

**Purpose.** Translate `architecture-v3.md` Phase 3a (Search Foundation) into a concrete execution plan: confirmed infrastructure, sequencing, file contracts, definitions of done. This is what a fresh agent reads to start coding without re-deriving design decisions.

**Read this AFTER `STATUS.md` and `architecture-v3.md`.** STATUS gives current state. arch-v2 is the canonical spec. This doc is the bridge: which arch-v2 decisions are settled, what to build next, in what order.

---

## Confirmed infrastructure (audited 2026-05-06)

All running and healthy via `memory/docker-compose.yml`:

| Service | Container | Image | Port | Used by |
|---|---|---|---|---|
| Postgres | `holocron_link-database-1` | `pgvector/pgvector:pg15` | 5432 | Honcho |
| Redis | `holocron_link-redis-1` | `redis:8.2` | 6379 | Honcho (and now Holocron's ingest queue) |
| Honcho API | `holocron_link-api-1` | custom | 8000 | Holocron memory layer |
| Honcho Deriver | `holocron_link-deriver-1` | custom | (internal) | Honcho's dreaming worker |

Connection: `postgresql://postgres:postgres@localhost:5432/postgres` (already in `editor/.env` as `DB_CONNECTION_URI`).

`pg` npm client already installed in `editor/package.json`. `bullmq` is NOT yet — add in step 3.

---

## Settled architectural decisions for Phase 3a

These resolve the questions raised during the pre-build audit. Don't relitigate.

### 1. Database layout
- **Single Postgres instance, two databases.** Honcho uses `postgres`. Holocron RAG uses a new database `holocron_rag`.
- **Why:** clean isolation (drop/restore Holocron RAG without touching Honcho memory), shared container infra, no extra RAM overhead.
- **Connection envs in `editor/.env`:**
  ```
  DB_CONNECTION_URI=postgresql://postgres:postgres@localhost:5432/postgres        # Honcho (existing)
  HOLOCRON_DB_URI=postgresql://postgres:postgres@localhost:5432/holocron_rag      # NEW — Holocron RAG
  ```
- pgvector extension is available on this Postgres image but **not used in v1** per arch-v2 §"Layer model" (Level 4 first). Schema deliberately omits vector columns; can be added later without breaking existing queries.

### 2. Ingestion worker pattern
- **In-process worker in Electron main process via `bullmq`.** Not a separate worker container/process.
- **Why:** single-user desktop app, Redis already up for Honcho, bullmq gives retry + persistence semantics so crashes don't lose pending ingestions, zero ops overhead vs separate process.
- Queue name: `holocron:ingest`. Concurrency: 2 (Gemini Flash is fast; don't burn all rate limit on one task).

### 3. Chokidar → ingestion handoff
- **Don't rewrite `workspace.ts`.** Add a *parallel subscriber* hook in main process: `subscribeWorkspaceFileChange(callback)`.
- The existing watcher keeps notifying the renderer for sidebar refresh. The new hook receives the same events in main and decides whether to enqueue ingestion.
- **2-second idle gate** before enqueuing. If a second change to the same file arrives within 2s, reset the timer. Prevents mid-edit ingestion.
- **Source-type detection** is path-based (regex against the relative path under `holocronRoot`):
  - `_Inbox/Inbox.md` → `inbox` (special: appended-to, treat each new section as one ingestion)
  - `_Projects/<project>/<thread>/BD_*.md` → `brain_dump`
  - `_Projects/<project>/<thread>/Notes_*.md` → `note`
  - `_Projects/<project>/<thread>/Reports/*.md` → `report`
  - `_Library/<...>/*.md` → `reference`
  - Anything else → ignored
- chokidar `depth` setting in `workspace.ts` is currently **3** — that's enough for project/thread/file but **too shallow for `_Library` deep nesting**. Bump to `5` or remove during step 3.

### 4. LLM client abstraction (`src/main/llmClient.ts`)

Unified entry point for all model calls. Wraps cost-tracking middleware so every cloud call writes a `rag_operations_log` row.

**Interface:**
```ts
type Provider = 'gemini' | 'anthropic' | 'lmstudio'

interface ChatRequest {
  provider: Provider
  model: string
  apiKey?: string                            // not needed for lmstudio
  baseUrl?: string                           // for lmstudio override
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
  stream?: boolean
  task?: string                              // e.g. 'tag-extract', 'wikilink-insert',
                                             // 'synthesis-essay' — for cost log + budget
}

interface ChatResponse {
  content: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  error?: string
}
```

**Internals:**
- `gemini` and `lmstudio` use OpenAI-compatible endpoint format (existing pattern).
- `anthropic` uses Anthropic's native format: `system` parameter is separate from `messages`, messages array only has `user` and `assistant` roles.
- Cost calculation: per-provider price table (input + output token rates). Update annually or when rates change.
- Budget check (`checkBudget()`): runs before any cloud call. Queries today's spend from `rag_operations_log`. Throws if hard-stop enabled and over daily limit.
- LM Studio bypasses cost tracking entirely (zero cost).

**Refactoring:** existing `lm:start` and `lm:complete` IPC handlers (in `ipc.ts`) move their fetch logic into `llmClient.ts`. Renderer-side `useLMStream.ts` keeps its interface unchanged — only main-process internals shift.

### 5. Provider-specific defaults
- **Gemini Flash** for ingestion (tag extraction, wikilink insertion), wiki compilation, conversational chat, redline requests.
- **Claude Sonnet 4.6** for synthesis essays + report generation.
- **LM Studio** for offline/privacy use; user toggles via hot-swap pill.
- These are *defaults* per arch-v2 §"Default task routing." User can override via the hot-swap pill (step 8).

### 6. OpenAI: not used.
Drop from any spec language. Gemini Flash uses an OpenAI-*compatible* URL (translation layer); the actual OpenAI API is not called.

---

## The 8 steps (step 9 already done in MVP-bug-fix session)

Dependency graph below. Steps with shared depth can run in parallel (e.g. via subagents); steps in sequence cannot.

```
            ┌────────────────────────────────┐
            │ 1. Postgres schema migration   │ ← starts here, no upstream
            └───────────────┬────────────────┘
                            │
              ┌─────────────┼──────────────┐
              ↓             ↓              ↓
      ┌──────────────┐ ┌──────────┐ ┌──────────────┐
      │ 4. llmClient │ │ 7. Search│ │ 6. HUD │
      │  + cost mw   │ │   tab UI │ │   tab + UI   │
      └──────┬───────┘ └────┬─────┘ └──────┬───────┘
             │              │              │
      ┌──────↓──────┐       │              │
      │ 5. Anthropic│       │              │
      │  provider   │       │              │
      └──────┬──────┘       │              │
             │              │              │
      ┌──────↓───────┐      │              │
      │ 3. Ingestion │      │              │
      │  pipeline    │──────┴──────────────┘
      └──────┬───────┘   (UI gets data once 3 produces rows)
             │
      ┌──────↓───────┐
      │ 8. Hot-swap  │
      │  provider pill│
      └──────────────┘

Step 2 (iCloud migration helper) is independent — can run anytime, low priority.
```

### Step 1 — Postgres schema migration
**Files:** `editor/scripts/db-setup.ts` (extend), new `editor/scripts/migrations/001_rag_schema.sql`.

**What:**
- Update `db-setup.ts` to also create database `holocron_rag` (if not exists), connect to it, run the migration SQL.
- Create the migration file with the full schema from arch-v2 §"Database schema" — `rag_documents`, `rag_tags`, `rag_document_tags`, `rag_relationships`, `rag_wiki_pages`, `rag_syntheses`, `rag_operations_log`, `rag_config` plus all indexes.
- Schema requires `pgcrypto` extension for `gen_random_uuid()`. Add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` at the top.
- Add `HOLOCRON_DB_URI` to `editor/.env` and `.env.template` (if exists).
- Add `npm run db:setup` script in `package.json` if not already wired.

**Definition of done:**
- `npm run db:setup` succeeds against the running Postgres.
- `psql $HOLOCRON_DB_URI -c "\dt"` lists all 8 tables.
- All indexes created.
- `to_regclass('rag_documents')` returns non-null.
- Re-running the migration is idempotent (uses `CREATE TABLE IF NOT EXISTS`).

**No upstream dependencies. Pure data layer. Lowest-risk step.**

---

### Step 4 — `llmClient.ts` + cost middleware
**Files:** new `editor/src/main/llmClient.ts`, modified `editor/src/main/ipc.ts` (refactor `lm:start` and `lm:complete` to use it).

**What:**
- Implement the `ChatRequest` / `ChatResponse` interface from §"Settled decisions" above.
- Provider adapters: `geminiAdapter`, `anthropicAdapter`, `lmstudioAdapter`.
- Cost middleware: `withCostLog(provider, task, fn)` wraps a call, measures latency, logs to `rag_operations_log` after.
- Budget pre-check: `checkBudget(): Promise<{ allowed: boolean; spentToday: number; limit: number }>`. If hard-stop on and over → throw before call.
- Price table per provider (constants in this file; manual update when prices change). Approximate v1 values:
  - Gemini Flash: input $0.075/M tokens, output $0.30/M tokens
  - Claude Sonnet 4.6: input $3/M, output $15/M
  - LM Studio: $0
- Refactor existing `ipc.ts` handlers `lm:start` and `lm:complete` to delegate to this module. Existing renderer code (`useLMStream.ts`) is untouched.

**Definition of done:**
- All existing chat flows still work (regression test: chat in editor, redline detection, brain dump → chat, address-all comments).
- A new `rag_operations_log` row appears for every chat send when watching `psql -c "SELECT * FROM rag_operations_log ORDER BY created_at DESC LIMIT 5"`.
- Anthropic provider can be called with a real API key and returns a result.
- `checkBudget()` returns `allowed: true` when log is empty.

---

### Step 5 — Anthropic SDK integration
**Files:** modified `llmClient.ts` (anthropic adapter), `Settings → Connections` UI for API key input.

**What:**
- Use Anthropic's REST API directly (no need for the SDK npm package; their REST endpoint is simple). Endpoint: `POST https://api.anthropic.com/v1/messages`.
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
- Translate `ChatRequest.messages` to Anthropic format:
  - Pull all `system` role messages, concatenate, send as top-level `system` parameter.
  - Send remaining `user`/`assistant` messages in `messages` array.
- Streaming: SSE format, similar to OpenAI's but slightly different event names (`content_block_delta` instead of `chat.completion.chunk`).
- Add `anthropic: { apiKey: string; model: string }` to settings store.
- Settings UI: input for API key + model dropdown (`claude-sonnet-4-5`, `claude-haiku-4-5`).

**Definition of done:**
- Hot-swap pill (step 8) can select Anthropic and a chat message gets a Sonnet response.
- Cost log shows correct USD figure for the call.
- Streaming works (text appears progressively in chat bubble).

---

### Step 3 — Ingestion pipeline (Pass 1)
**Files:** new `editor/src/main/ragIngest.ts`, modified `editor/src/main/workspace.ts` (add subscriber hook), modified `editor/src/main/ipc.ts` (manual ingest IPC).

**What (in order):**
1. Add `bullmq` dependency: `npm i bullmq`.
2. Create connection to Redis (already running) and a queue `holocron:ingest`.
3. Add `subscribeWorkspaceFileChange(cb)` to `workspace.ts`. Existing renderer notification stays.
4. In `ragIngest.ts`, register a subscriber that:
   - Filters by source-type regex (see §"Settled decisions" item 3).
   - Debounces with 2s idle gate per file path.
   - Enqueues `{ filePath, sourceType, projectName, threadName }` jobs.
5. Worker (also in `ragIngest.ts`) processes jobs:
   - Read file content.
   - Hash content; check `rag_documents` for existing row with same `source_path`. If hash matches, skip. If different, mark old row `is_active=FALSE`.
   - Insert new `rag_documents` row.
   - Call `llmClient.chat` with task `'tag-extract'` against Gemini Flash, prompt: "Extract 3-7 single-word or short-phrase tags from this content. Return JSON array."
   - Insert tags into `rag_tags` (UPSERT) + `rag_document_tags`.
   - Compute tag-overlap relationships (insert into `rag_relationships` with `discovered_by='tag-overlap'`).
   - Wikilink insertion deferred to Phase 3b (wiki pages don't exist yet in 3a).
   - Log to `rag_operations_log`.
6. IPC handler `rag:ingest-manual({ filePath })` for the Codex → Ingest tab in step 7.

**Definition of done:**
- Drop a `.md` file into `_Projects/.../<thread>/BD_*.md` → within ~5 seconds, a row appears in `rag_documents`.
- Tags appear in `rag_tags` + `rag_document_tags`.
- Activity appears in `rag_operations_log`.
- Editing the same file does NOT immediately re-trigger (2s gate works).
- Saving the same content twice does NOT create duplicate rows (hash check works).

---

### Step 7 — Codex tab + Search sub-tab
**Files:** new `editor/src/renderer/src/components/codex/` tree (`CodexTab.tsx`, `Search.tsx`), top-level tab integration in `Shell.tsx`.

**What:**
- Add "Codex" as a third top-level tab next to existing "Scribe" / "Projects" in `Shell.tsx`.
- Codex tab has 5 sub-tabs (per arch-v2 §"Codex tab"): Search, Wiki, Graph, Ingest, Syntheses. Implement Search now; placeholders for the rest.
- Search UI:
  - Text input.
  - Filter chips: source root (Projects / Codex / All), source type, project.
  - Result list: title, source_path, snippet, tags, click-through to open the file in Scribe tab.
- Backend: new IPC `rag:search({ query, filters })` runs:
  ```sql
  SELECT id, title, source_path, source_type, project_name, ts_rank(content_tsv, plainto_tsquery('english', $1)) AS rank,
         ts_headline('english', content, plainto_tsquery('english', $1), 'MaxFragments=2,MinWords=10,MaxWords=30') AS snippet
  FROM rag_documents
  WHERE is_active AND content_tsv @@ plainto_tsquery('english', $1)
        AND (...filter conditions)
  ORDER BY rank DESC LIMIT 50;
  ```

**Definition of done:**
- Search box returns results from ingested documents.
- Click a result → file opens in Scribe tab.
- Filters narrow results correctly.
- Empty result state is handled (no errors when no matches).

---

### Step 6 — HUD tab + widgets
**Files:** new `editor/src/renderer/src/components/hud/` tree.

**What:**
- Per arch-v2 §"HUD tab": status strip, stats grid, recent activity, recent insight placeholder, pending actions.
- IPC `dashboard:status` returns service health (Postgres, Honcho, Redis).
- IPC `dashboard:stats` returns counts (documents, wiki pages, connections, notes-this-week, redlines).
- IPC `dashboard:recent-activity` returns last 10 `rag_operations_log` entries.

**Definition of done:**
- HUD renders all five widget areas.
- Status dots correctly reflect service health (kill Postgres → dot turns red within 30s).
- Document count increments after ingesting a file.

---

### Step 8 — Hot-swap provider dropdown (chat header)
**Files:** modified `editor/src/renderer/src/components/chat/ChatPane.tsx`, modified `useLMStream.ts` (read selected provider from settings).

**Placement decision (2026-05-07):** dropdown lives in the chat panel **header**, alongside the AGENT label and Reset / Clear buttons. NOT bottom-of-input (the original arch-v2 sketch). Rationale: provider choice is a thread/agent-level concern; AGENT lives in the header; dropdown belongs there.

**What:**
- Header shows current provider name with a chevron (e.g. `⚡ Gemini Flash ▼`). Click → menu of configured providers.
- Disabled (grayed out) for providers without an API key configured. Tooltip on hover: "Add API key in Settings → Connections."
- Selecting a provider sets `config.activeProvider` (extend the existing `ActiveProvider` union to include `'anthropic'`). **Persistent until user changes again** — no per-message override.
- `useLMStream` already branches on `activeProvider` for `gemini` vs `lmstudio`; extend to handle `anthropic` (calls into `llmClient.chat()` from step 4).

**Definition of done:**
- Switching provider in the dropdown changes which model responds to the next message.
- Anthropic option is grayed out if no API key, enabled with key configured.
- Cost log (`rag_operations_log`) records the correct provider per message.

---

### Step 2 — iCloud root migration helper
**Files:** Settings UI enhancement — `Settings → Connections → Holocron Root`.

**What:** detect existing `_Projects` and `_Library` outside iCloud Drive path; prompt user to move them to iCloud-synced location; update `holocronRoot` config.

**Independent of all other steps. Low priority. Skip if user is comfortable with current root location and willing to manually migrate.**

---

### Step S — Native spell check (small, concurrent option)
**Files:** `editor/src/renderer/src/components/scribe/markdownConfig.ts` (~5 LOC).

**What:** add `EditorView.contentAttributes.of({ spellcheck: 'true' })` to `getMarkdownExtensions()`. Browser-native spell check using the OS dictionary; words show standard red underline. Free, no API calls.

**Out of scope:** custom user dictionary (use OS-level "Learn Spelling"), predictive text completions (deferred — cost + UX risk; see arch-v2 §"Scribe minor improvements" for full reasoning).

**Definition of done:** misspell a word in the editor, see red underline. Right-click shows OS suggestions + "Learn Spelling" option.

**Anytime task. Can be done in any session.**

---

## Suggested execution order across sessions

| Session | Goal | Steps | Approx context cost |
|---|---|---|---|
| 1 (foundation) | Schema + LLM abstraction working | 1, 4 | ~30% — mostly mechanical |
| 2 (ingestion) | Files turn into rows | 3 | ~40% — most complex step; design details emerge |
| 3 (cloud + UI) | Sonnet works + UI shell | 5, 7 | ~35% — Sonnet wiring + Search UI in parallel possible |
| 4 (visibility + polish) | HUD + hot-swap, ship gate | 6, 8, regression test | ~25% |
| 5 (optional) | iCloud helper | 2 | small |

Each session ends at a clean checkpoint: tests pass, screenshot of working state in commit message. Between sessions: `/clear`. Each new agent reads STATUS.md + this doc to ramp.

---

## What an executing agent must NOT relitigate

- The schema. It is correct. Don't redesign tables.
- pgvector. Not in v1.
- OpenAI. Not used.
- Worker pattern. bullmq, in-process. Don't introduce a separate worker process or skip Redis for naive in-memory.
- Database isolation. Separate `holocron_rag` database, not shared with Honcho's `postgres` database, not shared schema in same DB.
- LM Studio cost tracking. None — local model, zero cost. Don't try to compute pseudo-costs.
- Provider abstraction shape. Add a fourth provider later if needed; keep current three for now.

If a future requirement seems to push back on any of these, surface to user before changing — these were settled deliberately.

---

## Open items deferred to 3b/3c

These don't block 3a but will need decisions later:

- Wiki page disk format (write `.md` to `_Library/Wiki/`? — recommended yes)
- Telegram bot user-ID whitelist mechanism (env var on Worker recommended)
- Honcho dream polling cadence (every 6h initial; tune after observing first dreams)
- Cytoscape graph layout (default vs dagre vs cose-bilkent — decide after testing with real graph data)
- Per-task auto-routing override file (post-v1)
