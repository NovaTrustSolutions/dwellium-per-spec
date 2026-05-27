# Handoff v03 — Phase 3a Step 3 (Ingestion pipeline)

**To:** the next Claude session
**From:** prior session 2026-05-07 (shipped + verified steps 1, 4, 4.5, 5, plus pg/dotenv hotfix and Sonnet 4-6 bump)
**You are starting:** Phase 3a Step 3 — the ingestion pipeline. This is the meaty backend step that unblocks both Library/Search (step 7) and Dashboard (step 6). If Andy decides at session-start to do step 6 or 7 instead, those briefs are below in §"Alternative steps."

**Naming convention** (new this version): handoffs live in `docs/` as `HANDOFF_vNN_step-X.md`. `vNN` is monotonic (this is v03; predecessors are `HANDOFF_v01_step-4.md` and `HANDOFF_v02_step-5.md`). When you finish your work, write `HANDOFF_v04_step-X.md` for whatever comes next and commit it. Don't overwrite this file.

---

## Read order (5-10 min total)

1. **`docs/STATUS.md`** — current project state.
2. **`docs/phase-3a-execution.md`** — the canonical phase plan. Read the dependency graph and the spec for the step Andy picks.
3. **`docs/architecture-v3.md`** — schema + spec. The new "Cost Tracking & Dashboard" section is your reference for any cost-related work.
4. **`docs/gotcha.md`** — debugging discipline. Re-read before any 2+ turn debugging session.

---

## What's already done

| Step | Commit(s) | Status |
|---|---|---|
| **1** Postgres schema | `a0af8af` | ✓ Verified — 8 RAG tables idempotent via `npm run db:setup` |
| **4** `llmClient.ts` + cost middleware | `e067064` | ✓ Verified — Gemini Flash + Pro logging confirmed |
| **4.5** Provider routing + chat-header dropdown | `e7a5307`, `b067841` (pg hotfix), `2555232` (Settings cleanup) | ✓ Verified — all three providers route correctly |
| **5** Anthropic activation | `7d9e974`, `4495266` (Sonnet 4-6 bump) | ✓ Verified — real Anthropic round-trip in cost log: `provider='anthropic', model='claude-sonnet-4-6', cost_usd=$0.003876` |

The chat-header model dropdown (`ModelSelector.tsx`) is the canonical provider switcher. Options: LM Studio (local), Gemini Flash, Gemini Pro, Claude Sonnet (`claude-sonnet-4-6`). Cloud options gate on key presence; locked options show 🔒.

`rag_operations_log` is the source of truth for all cloud calls — query it whenever you need to verify routing, cost, or which provider/model handled a turn. LM Studio bypasses logging by design (local = $0).

---

## Your job: Step 3 — Ingestion pipeline

Per `docs/phase-3a-execution.md` §"Step 3" — that's your spec. Don't relitigate decisions in §"Settled architectural decisions" of that doc.

### Step 3 — Ingestion pipeline (your assignment)
**Files:** new `editor/src/main/ragIngest.ts`, modified `editor/src/main/workspace.ts` (subscriber hook), modified `editor/src/main/ipc.ts` (manual ingest IPC).

**What:** chokidar already watches the workspace. Add a parallel main-process subscriber that filters by source-type regex, debounces 2 seconds per file, and enqueues bullmq jobs. The worker reads the file, hashes content, checks `rag_documents` for an existing row, calls `chat({ provider: 'gemini', model: 'gemini-2.5-flash', task: 'tag-extract' })` to extract 3-7 tags, inserts tags + tag-overlap relationships, logs to `rag_operations_log`. **Add `bullmq` to `dependencies` (NOT `devDependencies` — see pg gotcha).**

**Context cost:** ~40% of context. Most architectural design happens here.

**Definition of done** is in `docs/phase-3a-execution.md` §"Step 3."

## Alternative steps (only if Andy redirects you at session-start)

### Step 6 — Dashboard tab + widgets (UI on top of existing data)
**Files:** new `editor/src/renderer/src/components/dashboard/` tree.

**What:** status strip (Postgres / Honcho / Redis), stats grid (document count, cost MTD, etc.), recent activity (last 10 `rag_operations_log` entries). The "Cost Tracking & Dashboard" section in `architecture-v3.md` has the exact SQL queries to copy into IPC handlers. **Don't build this before step 3** — until ingestion produces rows, the dashboard would just show zeros (cost rows aside).

**Context cost:** ~25% of context.

### Step 7 — Library tab + Search sub-tab (UI on top of existing data)
**Files:** new `editor/src/renderer/src/components/library/` tree.

**What:** add Library as a third top-level tab next to Editor / Projects. Search sub-tab queries `rag_documents` with `tsvector + GIN` index. Same dependency on step 3 (no rows = empty results). Spec in `phase-3a-execution.md` §"Step 7" including the exact SQL with `ts_rank` + `ts_headline`.

**Context cost:** ~30% of context.

### Step 2 — iCloud root migration helper (independent, low priority)
Settings UI helper to detect `_Projects` / `_Library` outside iCloud Drive and offer to move them. Skip if Andy is comfortable with current root.

**Context cost:** ~10%.

### Why step 3 first (your assignment)
Steps 6 and 7 against an empty `rag_documents` table are visually unsatisfying — both query a table the ingestion pipeline populates. Doing 3 first means 6 and 7 build against real data and can be tested incrementally. If Andy explicitly tells you to do 6 or 7 instead, fine — rename this file accordingly before committing your changes.

---

## Things settled — DO NOT re-design these

1. **Single Postgres instance, two databases.** RAG = `holocron_rag`. Honcho = `postgres`.
2. **No pgvector.** Level 4 only.
3. **No OpenAI provider.** Three providers: gemini, anthropic, lmstudio.
4. **bullmq + in-process worker** for ingestion (step 3, when you do it).
5. **2-second idle gate** on file changes before enqueuing ingestion (step 3).
6. **`llmClient.chat()` is the unified entry point.** All cloud calls go through it; LM Studio bypasses cost logging only.
7. **Renderer threads `provider` + `task` explicitly through IPC.** Heuristic remains as defensive fallback only.
8. **The chat-header dropdown is the canonical provider switcher.** Settings → Connections has API keys + per-provider model fields, no provider toggle.
9. **`rag_operations_log` is the cost source of truth.** When debugging "what model did this call hit?", query the log — never trust a model's self-report.

---

## Gotchas accumulated so far

- **`process.cwd()` in dev vs prod.** `npm run dev` sets cwd to `editor/`, so `dotenv.config()` (no args) finds `editor/.env`. The fallback `loadDotenv({ path: __dirname/../../.env })` covers the built-output case.
- **Native CJS deps must live in `dependencies`, not `devDependencies`.** `electron-vite`'s `externalizeDepsPlugin` only externalizes from `dependencies`. Anything in `devDependencies` gets bundled inline. Bundling complex CJS like `pg` causes `ReferenceError: Cannot access 'X' before initialization`. Fix: move to `dependencies`. Future deps to watch: `bullmq` (when step 3 lands).
- **Gemini SSE usage** requires `stream_options.include_usage: true`. Only requested for `provider !== 'lmstudio'`.
- **Anthropic SSE event names differ from OpenAI.** Adapters are split for that reason.
- **`activeStreamController.abort()` propagates through `chat()`** via `signal: req.abortSignal`. Adapter returns `{ error: '__aborted__', content: <partial> }`.
- **`rag_config` budget defaults are inserted lazily** by `ensureBudgetDefaults()` on first `checkBudget()` call. Not in any migration.
- **The dropdown is gated by `apiKey.trim()` length.** Whitespace-only keys are treated as missing.
- **Local models confabulate about their deployment.** Gemma 4 in LM Studio claimed "I am a cloud-based AI assistant trained by Google" — Gemma IS Google's model and small models don't know if they're running locally. This false-positive cost ~30 minutes during step 4.5 verification.
- **Claude models misidentify their own version.** Asking Claude 4.6 Sonnet "what model are you" can return "Claude 3.5 Sonnet" because training cutoff predates the model's own release docs. Don't use the self-report to verify routing — query `rag_operations_log`.

---

## Confirmed running infrastructure

```
Postgres   localhost:5432   pgvector/pgvector:pg15   container holocron_link-database-1
Redis      localhost:6379   redis:8.2                container holocron_link-redis-1
Honcho     localhost:8000   custom build             containers holocron_link-api-1 + deriver-1
```

`HOLOCRON_DB_URI` is in `editor/.env`. `npm run db:setup` is idempotent.

---

## Open questions you might hit (and the right answer)

- **"Should ingestion re-trigger on every file save?"** No. Auto-ingest on file *create*; manual "Re-ingest" button for edits. Avoids burning Gemini Flash tokens on every keystroke. Per `architecture-v3.md` §"Ingestion."
- **"What's the chunking strategy?"** None — Level 4 doesn't chunk. Each file becomes one `rag_documents` row with full content. Step 3.5+ may add chunking if vector search is added later.
- **"Should step 3 also do wikilink insertion?"** No. Wikilink insertion needs wiki pages to exist, and wiki pages are Phase 3b. Step 3 only does tag extraction.
- **"Should I pre-fetch the next-tier cost dashboard?"** No. The `architecture-v3.md` "Cost Tracking & Dashboard" section is the spec — implement when you do step 6, not before.

---

## What's next after Phase 3a

Phase 3b — wiki + connections + bridges. Phase 3c — synthesis + Mind tab + graph. Both specs are in `architecture-v3.md` §"Implementation phases."

---

**Current branch:** `main`. **Latest commit:** `4495266` (Sonnet 4-6 follow-up cleanup). Check `git log -5` for context.

**You're cleared to begin once Andy picks a step.** Good luck.
