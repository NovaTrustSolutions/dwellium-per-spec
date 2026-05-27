# Handoff v06 — Phase 3b Step 10 (Wiki compilation pipeline)

**To:** the next Claude session
**From:** prior session 2026-05-08 (closed Phase 3a — shipped step 6 Dashboard, step 7 Library/Search, search persistence; ship-gate path verified)
**You are starting:** **Phase 3b. Step 10 first** — the wiki compilation pipeline. It's the backend that produces the artifacts steps 11/12/14 all depend on. Don't take a UI step until 10 lands.

**Naming convention:** handoffs live in `docs/` as `HANDOFF_vNN_step-X.md`, monotonic counter. Predecessors: `v01_step-4.md`, `v02_step-5.md`, `v03_step-3.md`, `v04_step-7.md`, `v05_step-6.md`. When you finish, write `HANDOFF_v07_step-X.md` for whatever comes next.

---

## Read order (10-15 min total)

1. **`docs/STATUS.md`** — current project state. Phase 3a is complete; 3b starts here.
2. **`docs/architecture-v3.md` §"The compounding loop — six passes"** — Step 10 is Pass 2 of the loop. The other passes provide context.
3. **`docs/architecture-v3.md` §"Database schema"** — `rag_wiki_pages` table is your write target.
4. **`docs/architecture-v3.md` §"Wikilink-as-edge pipeline"** — explains why wiki pages need to exist before step 12 can insert wikilinks.
5. **`docs/architecture-v3.md` §"Filesystem layout"** — wiki pages must also be written to disk under `_Library/Wiki/<slug>.md` (rebuildable index pattern).
6. **`docs/gotcha.md`** — debugging discipline + accumulated priors.
7. **`editor/src/main/ragIngest.ts`** — read end-to-end. Step 10 hooks into this pipeline.
8. **`editor/src/main/ragSearch.ts`** + `editor/src/main/dashboard.ts` — examples of well-bounded RAG-side modules. Mirror their shape for `ragWiki.ts`.

---

## What's already done (Phase 3a complete)

| Step | Commit(s) | Status |
|---|---|---|
| 1 Postgres schema | `a0af8af` | ✓ |
| 4 `llmClient.ts` + cost middleware | `e067064` | ✓ |
| 4.5 Provider routing | `e7a5307`, `b067841`, `2555232` | ✓ |
| 5 Anthropic activation | `7d9e974`, `4495266` | ✓ |
| 3 Ingestion pipeline | `13ae9a1`, `1a4019b`, `d1f02d5`, `c16a862`, `9c7a980` | ✓ |
| Migration 002 (namespace gate) | `7a80828` | ✓ |
| 7 Library tab + Search | `085764c` | ✓ |
| 7.1 Search persistence across tab switches | `e0ec251` | ✓ |
| 6 Dashboard tab + widgets | `32be261` | ✓ |

Optional 3a items still pending (independent, low priority):
- Step 2 (iCloud root helper) — only relevant if root is moved
- Step 8 (hot-swap provider pill) — chat-header dropdown already covers this functionally

---

## Your job: Step 10 — Wiki compilation pipeline

Per `architecture-v3.md` §"The compounding loop — Pass 2" — that's your spec.

### What it does

After every 5 ingests (or on manual trigger), pick the wiki pages whose subject matter is "affected" by the recent ingests and recompile them. Each wiki page is:
- A row in `rag_wiki_pages` (slug, title, content, source_count, updated_at)
- A markdown file at `_Library/Wiki/<slug>.md` — durable artifact, rebuildable from disk

A wiki page's **content** is a synthesized markdown document compiled from N source `rag_documents` rows that share the page's tag(s) or are mentioned by name. Gemini Flash does the synthesis. Goal: a structured, readable summary that an agent can pull as context, not an essay (Sonnet handles essays in Pass 4 — Phase 3c).

### Files to add / modify

**Backend (3 + 1 small ingest hook):**
- `editor/src/main/ragWiki.ts` *(new)* — public functions:
  - `compileWikiPage(slug: string, opts?: { force?: boolean }): Promise<{ ok: bool, slug, content?, error? }>`
  - `compileAffectedPages(): Promise<{ compiled: string[], skipped: string[] }>`
  - `listWikiPages(): Promise<Array<{ slug, title, source_count, updated_at }>>`
  - `getWikiPage(slug: string): Promise<{ slug, title, content, source_count, updated_at } | null>`
  - `regenerateWikiPage(slug: string): Promise<...>` (alias for compileWikiPage with force=true)
- `editor/src/main/ipc.ts` — handlers: `wiki:list`, `wiki:get`, `wiki:compile-now`, `wiki:regenerate`.
- `editor/src/preload/index.ts` — bindings; types in `renderer/src/types/ipc.ts`.
- `editor/src/main/ragIngest.ts` — at the end of `processIngest`, after `recomputeTagOverlap`, increment a counter and call `compileAffectedPages()` when it hits 5. Reset the counter. Use a module-private variable; persistence isn't necessary since we just want batched recomputation.

### Identifying "affected" wiki pages

A wiki page is **affected by** a recently-ingested document when:
1. The doc has any tag the wiki page is "about" (the page's primary tags), OR
2. The wiki page's title appears in the doc's content (case-insensitive substring) — bidirectional with step 12's wikilink insertion.

For v1, **define a wiki page's primary tags as the tags of all docs currently linked to it** (stored in a join table `rag_wiki_page_sources` you'll add — see schema below). When a new doc is ingested with overlapping tags, that's an affected page.

If no wiki pages exist yet (cold-start), compileAffectedPages should bootstrap: for every distinct tag with ≥ 3 documents, create a wiki page with `slug = tag-name`, `title = TitleCase(tag-name)`, and compile from all docs sharing that tag. This gives the corpus a wiki shape on the first 5-ingest cycle.

### Schema addition (migration 003)

You need a join table to track which docs back which wiki page. Without it, "affected pages" can't be computed cheaply.

Write `editor/scripts/migrations/003_wiki_sources.sql`:

```sql
CREATE TABLE IF NOT EXISTS rag_wiki_page_sources (
  wiki_page_id UUID REFERENCES rag_wiki_pages(id) ON DELETE CASCADE,
  document_id  UUID REFERENCES rag_documents(id)  ON DELETE CASCADE,
  PRIMARY KEY (wiki_page_id, document_id)
);
CREATE INDEX IF NOT EXISTS rag_wiki_page_sources_doc_idx
  ON rag_wiki_page_sources(document_id);
```

Add `'rag_wiki_page_sources'` to `RAG_TABLES` in `db-setup.ts` so the post-apply assertion catches a missing migration. The runner from migration 002 picks up `003_*.sql` automatically.

### Compilation prompt (Gemini Flash)

System: `You compile structured wiki pages from source documents. Output Markdown only. Sections: Overview (2-3 sentences), Key concepts (bulleted, with one-line explanations), Open questions, Sources. Do not invent facts.`

User template:
```
Compile a wiki page on: {tag-or-title}

Source documents (titles + content excerpts):

[1] {title}
{content, capped to ~2000 chars}

[2] {title}
{content, capped to ~2000 chars}

…

Return Markdown only. Use [N] citation markers in-line that reference the Source list at the bottom.
```

Cap total prompt at ~24k chars (same as tag-extract). `maxTokens: 4096`. **Use Flash, not Sonnet** — this is structural transformation per the task-routing rules. Synthesis essays (Sonnet) come in Phase 3c.

### Disk write pattern

After insert/update of `rag_wiki_pages` row, write the markdown to disk at `<holocronRoot>/../_Library/Wiki/<slug>.md`. Existing files get overwritten. Failure to write to disk is non-fatal — log a warning and proceed. (DB row is the cache; if disk write fails the row still represents truth, and a later compile attempt can rewrite.)

The `_Library/Wiki/` dir may not exist; `mkdir -p` it. Don't trigger chokidar reingestion of these files — exclude `_Library/Wiki/` paths from `detectSourceType` in `ragIngest.ts` (one-line regex addition).

### Definition of done

- Migration 003 applies cleanly via `npm run db:setup`. Idempotent re-run is a no-op.
- After 5 fresh ingests with overlapping tags, at least one wiki page exists in `rag_wiki_pages` and on disk under `_Library/Wiki/<slug>.md`.
- The wiki page's content is structured Markdown (Overview / Key concepts / Open questions / Sources).
- `wiki:list` IPC returns the page in the expected shape; `wiki:get` returns full content.
- Manually triggering `wiki:compile-now` recompiles affected pages without waiting for the 5-ingest cycle.
- `wiki:regenerate` on an existing slug forces a fresh Gemini call even if the source set hasn't changed.
- Wiki page disk files are NOT picked up by chokidar as new ingest sources (exclude `_Library/Wiki/` from `detectSourceType`).
- `tsc --noEmit` clean.
- `npm run build` clean.
- Cost log (`rag_operations_log`) records the compile call with `task: 'wiki-compile'`, `provider: 'gemini'`.

### Smoke verification suggestion

1. Drop 5 brain dumps with overlapping vocabulary into a watched project.
2. After the 5th completes, query `SELECT slug, title, source_count FROM rag_wiki_pages` — expect ≥ 1 row.
3. `cat _Library/Wiki/<slug>.md` — verify it's structured Markdown with citations.
4. Manually call `wiki:regenerate` via DevTools (`window.electronAPI.wikiRegenerate('<slug>')`) — expect new `rag_operations_log` row, content updated.
5. Touch one of the source docs (no content change) — verify dedup; counter does NOT increment, no wiki recompile.

---

## Things settled — DO NOT re-design these

1. **Wiki compilation uses Gemini Flash, not Sonnet.** Sonnet is reserved for Pass 4 synthesis essays (Phase 3c). Per arch-v2 §"Provider matrix".
2. **5-ingest batching, not per-ingest.** Recompiling on every ingest would burn API calls. Module-private counter, no persistence needed (acceptable to lose the count on restart — pages just recompile on the next 5th ingest).
3. **Disk artifact under `_Library/Wiki/<slug>.md`.** Markdown file is the durable artifact; DB is the cache. Rebuildable index pattern.
4. **Cold-start: every tag with ≥ 3 docs gets a wiki page on first compile cycle.** Heuristic, simple.
5. **Wiki pages don't get re-ingested.** Exclude `_Library/Wiki/` from `detectSourceType` to prevent infinite loops.
6. **Slugs are lowercase-hyphenated tag names** for cold-start; user can manually create pages with arbitrary slugs in later sub-steps. For step 10, only the auto-generated tag-based pages.
7. **Polling, not push, throughout.** Same as Dashboard.
8. **Single Postgres instance, two databases.** RAG = `holocron_rag`.
9. **Background tasks (tag-extract, wiki-compile) hardcode Gemini Flash.** They never read the user's UI provider selection.

---

## Gotchas accumulated so far

- **`process.cwd()` in dev vs prod.** `npm run dev` sets cwd to `editor/`; dotenv finds `editor/.env`.
- **Native CJS deps must live in `dependencies`.** Externalization rule from electron-vite.
- **Gemini SSE usage** requires `stream_options.include_usage: true`. Only requested for `provider !== 'lmstudio'`.
- **Anthropic SSE event names differ from OpenAI.** Adapters split.
- **Gemini 2.5 Flash thinking-mode tokens count against `max_tokens`.** Budget at least 2048 for compile calls (output is much larger than tag-extract). See `docs/code.md`.
- **`rag_config` budget defaults are inserted lazily** by `ensureBudgetDefaults()` on first `checkBudget()` call.
- **The chat-header dropdown is gated by `apiKey.trim()` length.**
- **Local models confabulate about their deployment.** Verify routing via `rag_operations_log`.
- **Stale preload after preload changes.** Cmd+Shift+R the renderer + restart `npm run dev` after editing `src/preload/index.ts`. You'll hit this since step 10 adds new wiki:* IPC bindings.
- **Chokidar misses brand-new subdirectories on macOS.** Pre-existing dirs fire correctly; new project dirs created at runtime are silently ignored despite recursive watch. Workaround: restart `npm run dev`. Real fix deferred. See `gotcha.md`.
- **Disk writes inside watched dirs can echo back through chokidar.** This is exactly why you must exclude `_Library/Wiki/` from `detectSourceType`.

---

## Confirmed running infrastructure

```
Postgres   localhost:5432   pgvector/pgvector:pg15   container holocron_link-database-1
Redis      localhost:6379   redis:8.2                container holocron_link-redis-1
Honcho     localhost:8000   custom build             containers holocron_link-api-1 + deriver-1
```

`HOLOCRON_DB_URI` is in `editor/.env`. `npm run db:setup` is idempotent and applies all `editor/scripts/migrations/*.sql` files in lex order via the runner shipped in `7a80828`. Add your migration 003 to that directory and the runner picks it up.

---

## Open questions you might hit (and the right answer)

- **"Should I compile every wiki page on every 5-ingest cycle, or only affected ones?"** Only affected. The whole point of the join table is fast affected-pages lookup. A full recompile is what `wiki:regenerate` is for, on user request.
- **"What if the wiki page disk file already exists with manual edits?"** v1: overwrite. The DB+compile is canonical. v2 (later) could merge a "preserve user edits between markers" pattern if Andy ever asks for it.
- **"Should wiki pages get tagged themselves and feed back into ingestion?"** Yes — wiki pages should be ingested as `source_type='wiki'` once written (mirrors how syntheses get re-ingested in Phase 3c). But the recursion needs guarding: ingesting a wiki page must NOT trigger another wiki recompile of itself. Easiest: skip the 5-ingest counter for `source_type='wiki'`. Document this in the code, and DON'T let the counter cycle on wiki ingests.
- **"What about the stat shown on Dashboard — 'Wiki Pages: 0'?"** That'll start incrementing automatically once `rag_wiki_pages` rows exist. Dashboard reads `(SELECT COUNT(*) FROM rag_wiki_pages)` already. No Dashboard work needed.
- **"Should I handle the chokidar new-dir gotcha as part of this step?"** No. Out of scope. Restart `npm run dev` if you create a brand-new project dir during smoke testing.
- **"What if Gemini Flash returns prose instead of structured Markdown?"** Tighten the system prompt and add a max-retries=2 with a stricter user-prompt on retry. Don't post-process — if the model can't follow the format twice in a row, log + skip the page; user-facing degradation is better than fabricated structure.

---

## What's next after step 10

Step 11 (Wiki sub-tab UI) — lights up the Library tab's second sub-tab. Renders `wiki:list` as a grid, `wiki:get` for the readable view, "Regenerate" button calls `wiki:regenerate`. ~3-4 new files in `library/`, mirroring `Search.tsx`'s structure.

Step 12 (Wikilink-as-edge insertion) is the natural follow-up to 11 — extends `ragIngest.ts` to scan ingested doc content against `rag_wiki_pages.title`, insert `[[wikilinks]]`, write back to disk, log relationships. Don't start it before 10 ships; it depends on wiki pages existing.

Step 14 (Cmd+K wikilink picker) is small once the wiki page list exists.

Step 17 (Telegram Inbox) is independent; can land any time. Needs Andy to deploy the Cloudflare Worker.

Phase 3c after that — synthesis essays + Mind tab + Cytoscape graph.

---

**Current branch:** `main`. **Latest commit:** `e0ec251` (Library Search persistence). **Phase 3a's last commit:** `32be261` (Dashboard). Check `git log -15` for the full Phase 3a trail.

**You're cleared to begin step 10 immediately.** Good luck.
