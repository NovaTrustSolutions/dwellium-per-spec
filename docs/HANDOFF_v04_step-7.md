# Handoff v04 — Phase 3a Step 7 (Library/Search) gated by migration 002 (namespace isolation)

**To:** the next Claude session
**From:** prior session 2026-05-07 (shipped step 3 ingestion + namespace spec; **smoke-verified end-to-end** 2026-05-07 evening incl. tag-extract maxTokens hotfix)
**You are starting:** **migration 002 first, then step 7.** Step 7 cannot land without the namespace gate; details below.

**Naming convention:** handoffs live in `docs/` as `HANDOFF_vNN_step-X.md`, monotonic counter. Predecessors: `v01_step-4.md`, `v02_step-5.md`, `v03_step-3.md`. When you finish, write `HANDOFF_v05_step-X.md` for whatever comes next.

---

## Read order (10-15 min total)

1. **`docs/STATUS.md`** — current project state.
2. **`docs/phase-3a-execution.md`** — canonical phase plan.
3. **`docs/architecture-v3.md` §"Namespace & Context Isolation"** — the spec you're implementing in migration 002. Read this carefully.
4. **`docs/architecture-v3.md` §"Database schema"** — for the `rag_namespaces` table you're adding.
5. **`docs/gotcha.md`** — debugging discipline.
6. **`editor/src/main/ragIngest.ts`** — the file you'll modify for the namespace gate.

---

## What's already done

| Step | Commit(s) | Status |
|---|---|---|
| **1** Postgres schema | `a0af8af` | ✓ Verified |
| **4** `llmClient.ts` + cost middleware | `e067064` | ✓ Verified |
| **4.5** Provider routing + chat-header dropdown | `e7a5307`, `b067841`, `2555232` | ✓ Verified |
| **5** Anthropic activation | `7d9e974`, `4495266` | ✓ Verified |
| **3** Ingestion pipeline | `13ae9a1`, `1a4019b` (queue rename), `d1f02d5` (path-prefix), `c16a862` (tag-extract maxTokens), `9c7a980` (diag log removed) | ✓ **Verified end-to-end** — see below |
| Namespace spec | `7859a5b` | Spec only; implementation = your job |

### ✓ Step 3 smoke status — verified 2026-05-07

End-to-end smoke ran clean. Highlights:

- **Tag extraction:** brain-dump file → 7 tags returned by Gemini Flash, parsed and inserted, ingest in 1693ms.
- **Hash dedup:** `touch` on an existing BD with no content change → log entry with `skipped:true`, 17ms, no new `rag_documents` row, no Gemini call.
- **Tag-overlap relationship:** new BD with overlapping vocabulary → 4 shared tags discovered against the prior doc, one `tag-shared` row written with `discovered_by='tag-overlap'` and `strength=0.571` (4/7).
- Fixture files left in place at `_Projects/AstraStrata_PRDs/PRD-02-Astra/BD_diag_*.md` and `BD_overlap_smoketest_001.md` — useful for migration-002 cross-namespace testing (you can drop a doc into a *different* project and confirm relationships do/don't form per the gate).

**One bug found and fixed during smoke (`c16a862`):** `extractTags()` had `maxTokens: 200`, which Gemini 2.5 Flash thinking-mode tokens consumed before emitting the JSON array. Result was truncated raw responses (e.g. `["case-management",`) → `parseTagsFromResponse` returned `[]` → empty `rag_tags`. Bumped to 1024. Logged in `docs/code.md`. **Watch for this on any future Gemini 2.5 task** — thinking-mode counts against `max_output_tokens`.

---

## Your job (in strict order)

### Stage 1 — Migration 002: namespace isolation

**Files:** new `editor/scripts/migrations/002_namespaces.sql`, modified `editor/scripts/db-setup.ts` (apply both migrations on run), modified `editor/src/main/ragIngest.ts` (gate `recomputeTagOverlap`).

**Andy's simplification (decided 2026-05-07):** **namespace == `project_name`. 1:1.** Do NOT add a separate `namespace` column to `rag_documents`. The `project_name` field is the namespace identifier. The new `rag_namespaces` table keys on the project name string. If decoupling is needed later, that's a future migration.

**Schema (`002_namespaces.sql`):**
```sql
CREATE TABLE IF NOT EXISTS rag_namespaces (
  name                 TEXT PRIMARY KEY,                 -- matches rag_documents.project_name
  is_bridge_namespace  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill: every project_name currently in rag_documents gets an isolated namespace row.
INSERT INTO rag_namespaces (name)
SELECT DISTINCT project_name FROM rag_documents WHERE project_name IS NOT NULL
ON CONFLICT (name) DO NOTHING;
```

**`db-setup.ts`** — currently runs only `001_rag_schema.sql`. Generalize to scan `editor/scripts/migrations/*.sql` in lex order and apply each. Track applied migrations in a `rag_schema_migrations` table (filename + applied_at). Idempotent. This unlocks future migrations without rewriting db-setup each time.

**Ingest gate** — `recomputeTagOverlap` in `ragIngest.ts` currently forms tag-shared relationships **across all documents regardless of namespace.** That's what the namespace migration changes. New rule (verbatim from `architecture-v3.md` §"Namespace & Context Isolation"):

- Same namespace (both `project_name` equal, including both NULL for inbox/library docs) → form relationship.
- Different namespaces, **either** namespace's `is_bridge_namespace = TRUE` → form relationship.
- Different namespaces, neither is bridge → **skip silently, no row.**

The `_Library` and `_Inbox` source roots have `project_name = NULL`. Treat NULL project_name as a special namespace `__library__` / `__inbox__`. Either:
- (a) coalesce to a synthetic name in the gate query, OR
- (b) define library/inbox as implicit bridge namespaces — they're meant to be cross-domain by nature.

Recommendation: **(b). Library and Inbox are bridges by design.** Document this in the migration's seed: insert default rows `('__library__', TRUE)` and `('__inbox__', TRUE)`. Update the ingest gate to look up the synthetic name when `project_name IS NULL`.

**SQL pattern for the gated overlap query** — modify the join in `recomputeTagOverlap` to pull `project_name` and `is_bridge_namespace` for both docs, and filter:
```sql
WHERE (
  d_other.project_name IS NOT DISTINCT FROM d_self.project_name
  OR n_self.is_bridge_namespace
  OR n_other.is_bridge_namespace
)
```

### Stage 2 — Backfill cleanup

**Existing `rag_relationships` rows are dirty.** Step 3 has been forming tag-shared relationships across namespaces since `13ae9a1` landed, ignoring the gate that didn't exist yet. Once migration 002 enforces the rule, those cross-namespace rows are conceptually wrong and may already exist in Andy's local DB.

Cleanup SQL (run once after the migration applies, idempotent):
```sql
DELETE FROM rag_relationships r
WHERE r.relationship = 'tag-shared'
  AND EXISTS (
    SELECT 1
    FROM rag_documents da
    JOIN rag_documents db ON db.id = r.document_b_id
    LEFT JOIN rag_namespaces na ON na.name = COALESCE(da.project_name, '__' || da.source_root || '__')
    LEFT JOIN rag_namespaces nb ON nb.name = COALESCE(db.project_name, '__' || db.source_root || '__')
    WHERE da.id = r.document_a_id
      AND COALESCE(da.project_name, '__' || da.source_root || '__') <> COALESCE(db.project_name, '__' || db.source_root || '__')
      AND COALESCE(na.is_bridge_namespace, FALSE) = FALSE
      AND COALESCE(nb.is_bridge_namespace, FALSE) = FALSE
  );
```

Bake this into `002_namespaces.sql` so applying the migration cleans existing data atomically. Test by querying `rag_relationships` before/after on Andy's DB — there should be a delta if step 3 has been running long enough to produce cross-namespace overlaps.

### Stage 3 — Step 7: Library tab + Search sub-tab

Per `phase-3a-execution.md` §"Step 7" — that's your spec. **Add the namespace filter.** Search must default to scoping by active project's namespace; cross-namespace results require explicit opt-in (a "Search across all namespaces" toggle on the Search UI).

**SQL pattern for namespace-aware search:**
```sql
SELECT id, title, source_path, source_type, project_name,
       ts_rank(content_tsv, plainto_tsquery('english', $1)) AS rank,
       ts_headline('english', content, plainto_tsquery('english', $1), 'MaxFragments=2,MinWords=10,MaxWords=30') AS snippet
FROM rag_documents d
LEFT JOIN rag_namespaces n ON n.name = d.project_name
WHERE d.is_active
  AND d.content_tsv @@ plainto_tsquery('english', $1)
  AND (
    -- Default: same namespace as the active project (passed as $2).
    -- When $3 (cross_namespace flag) is TRUE, allow bridges + same-namespace.
    d.project_name = $2
    OR ($3 AND COALESCE(n.is_bridge_namespace, FALSE))
  )
ORDER BY rank DESC LIMIT 50;
```

The Library tab UI per `phase-3a-execution.md` §"Step 7" lists 5 sub-tabs (Search, Wiki, Graph, Ingest, Syntheses). Implement Search now; placeholders for the rest.

### Stage 4 — Settings: bridge namespace toggle

Add a simple Settings → Connections panel (or a new tab) that lists every row from `rag_namespaces` with a toggle for `is_bridge_namespace`. Saves via a new IPC `rag:namespaces-list` / `rag:namespace-set-bridge`. Defer this UI if context budget gets tight — Andy can flip flags directly via psql for v1 testing.

---

## Definition of done

- Migration 002 applies cleanly via `npm run db:setup` (idempotent re-run is a no-op).
- `rag_namespaces` table exists with one row per existing `project_name` plus `__library__` and `__inbox__` as bridges by default.
- `recomputeTagOverlap` in `ragIngest.ts` skips cross-namespace pairs unless one side is a bridge. Add a unit-style test or just smoke it: ingest a doc in project A and project B (neither bridge), confirm no `tag-shared` row spans them.
- Backfill SQL ran; `rag_relationships` no longer contains illegal cross-namespace tag-shared rows.
- Library tab renders in the renderer; Search sub-tab returns results scoped to the active namespace by default; toggling cross-namespace expands to include bridges.
- Cost log (`rag_operations_log`) shows search ops if Andy wants them logged (your call — search is a DB query, not an LLM call, so cost = 0; logging just for activity-feed visibility).
- `npm run typecheck` clean.
- Manual smoke: drop two unrelated-namespace files, confirm no relationship; mark one as bridge, drop another file, confirm relationship forms.

---

## Things settled — DO NOT re-design these

1. **Single Postgres instance, two databases.** RAG = `holocron_rag`.
2. **No pgvector.** Level 4 only.
3. **Three providers: gemini, anthropic, lmstudio.** No OpenAI.
4. **bullmq + in-process worker** for ingestion (already shipped step 3).
5. **2-second idle gate** on file changes (already shipped).
6. **`llmClient.chat()` is the unified entry point.** All cloud calls go through it; LM Studio bypasses cost logging.
7. **Renderer threads `provider` + `task` explicitly through IPC.** Heuristic remains as defensive fallback.
8. **The chat-header dropdown is the canonical provider switcher.**
9. **`rag_operations_log` is the cost source of truth.**
10. **Background tasks (tag-extract) hardcode Gemini Flash.** They never read the user's UI provider selection.
11. **Namespace == `project_name` (1:1 for v1).** No separate `namespace` column on `rag_documents`. If decoupling is needed later, that's a future migration. Decided 2026-05-07.
12. **`_Library` and `_Inbox` are implicit bridge namespaces** (`__library__`, `__inbox__`). They're meant to be cross-domain.

---

## Gotchas accumulated so far

- **`process.cwd()` in dev vs prod.** `npm run dev` sets cwd to `editor/`, so `dotenv.config()` (no args) finds `editor/.env`. Fallback `loadDotenv({ path: __dirname/../../.env })` covers built output.
- **Native CJS deps must live in `dependencies`, not `devDependencies`.** Externalization rule from electron-vite. `pg`, `dotenv`, `bullmq` all in `dependencies` — keep future deps there too.
- **Gemini SSE usage** requires `stream_options.include_usage: true`. Only requested for `provider !== 'lmstudio'`.
- **Anthropic SSE event names differ from OpenAI.** Adapters split for that reason.
- **`activeStreamController.abort()` propagates through `chat()`** via `signal: req.abortSignal`.
- **`rag_config` budget defaults are inserted lazily** by `ensureBudgetDefaults()` on first `checkBudget()` call. Not in any migration.
- **The dropdown is gated by `apiKey.trim()` length.** Whitespace-only keys treated as missing.
- **Local models confabulate about their deployment.** Gemma 4 in LM Studio claimed it was a "cloud-based AI by Google." Verify routing via `rag_operations_log`, never via the model's self-report.
- **Claude models misidentify their own version.** Sonnet 4.6 says "I am Claude 3.5 Sonnet" because training cutoff predates its own release. Same fix: query the cost log.
- **Tag-overlap relationships are NOT yet namespace-gated** — that's literally your job. Don't be surprised if `rag_relationships` already has cross-domain rows from step 3 ingest runs. The backfill SQL in §"Stage 2" cleans them.

---

## Confirmed running infrastructure

```
Postgres   localhost:5432   pgvector/pgvector:pg15   container holocron_link-database-1
Redis      localhost:6379   redis:8.2                container holocron_link-redis-1
Honcho     localhost:8000   custom build             containers holocron_link-api-1 + deriver-1
```

`HOLOCRON_DB_URI` is in `editor/.env`. `npm run db:setup` is idempotent. After your migration 002 lands it'll apply both 001 and 002 (and any future NN_*.sql files in `editor/scripts/migrations/`).

---

## Open questions you might hit (and the right answer)

- **"Should I add a `namespace` column to `rag_documents` for query performance?"** No. Andy explicitly said 1:1 with `project_name`. If joins on `rag_namespaces` get slow, the answer is an index on `rag_namespaces.name` (already PK so it's indexed) and possibly a covering index on `rag_documents(project_name)` (already exists as `rag_documents_project_idx`). Don't add a denormalized column.
- **"Should `_Library` docs share tag-overlap with each other?"** Yes — `__library__` is a single namespace, so library-to-library overlaps form. Also forms with anything else because it's a bridge.
- **"What about `_Inbox`? Inbox dumps are messy."** Same — bridge. The ingestion agent will eventually re-route Inbox content into proper Projects (Phase 3b territory), at which point those docs lose their `__inbox__` namespace and inherit the project's. Don't worry about it for now.
- **"Should the namespace toggle UI live in Settings or in a new Library → Namespaces sub-tab?"** Andy's call. Default to Settings → Connections (existing pattern, less new UI surface). Library → Namespaces could come later if the list gets long.
- **"What if backfill SQL is slow on a large `rag_relationships` table?"** Andy's table is single-user and small. Don't optimize. If a future user has 100k+ rows, batch it then.

---

## What's next after step 7

Phase 3b — wiki + connections + bridges. Per `architecture-v3.md` §"Implementation phases — Phase 3b." Starts with wiki page compilation (turning a tag's documents into a synthesized `_Library/Wiki/<slug>.md` via Claude Sonnet) and wikilink insertion in existing docs.

Step 6 (Dashboard) and Step 2 (iCloud helper) remain in Phase 3a but can land in any order. Step 6 against real data is now satisfying since steps 3 + 7 produce rows.

---

**Current branch:** `main`. **Latest commit:** `9c7a980` (chore: remove tag-extract diagnostic log). Check `git log -10` for the step-3 fix trail (`c16a862` is the maxTokens hotfix).

**Step 3 smoke is green; you're cleared to begin migration 002 immediately.** Good luck.
