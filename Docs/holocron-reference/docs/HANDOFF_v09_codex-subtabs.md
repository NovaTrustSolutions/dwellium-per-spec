# Handoff v09 — Domaines layer + Codex Ingest shipped; Graph + Synthesis next

**To:** the next Claude session
**From:** prior session 2026-05-11 — shipped the full UI rename pass (Library→Codex, Editor→Scribe, Dashboard→HUD, Projects tab→Domaines), the user-visible Holocron→Agenteryx swap, the entire Task 2 Domaines layer (8 commits), and the Codex/Ingest sub-tab. Three Codex sub-tabs were grayed-out coming in; Ingest is now live, Graph + Synthesis remain.
**You are starting:** Codex/Graph sub-tab — plan first, confirm with Andy before writing code.

**Naming convention:** handoffs live in `docs/` as `HANDOFF_vNN_step-X.md`. Predecessors: v01–v08 use the pre-rename vocabulary (Library/Editor/Dashboard/Projects). This is the first under the new vocabulary.

---

## Read order (~15 min)

1. **`docs/STATUS.md`** — refreshed in this session; current as of 2026-05-11.
2. **`docs/architecture-v3.md`** — the canonical vision/planning document (renamed from architecture-v2 this session; all references updated). Part 2 + Part 6 reflect what shipped.
3. **`docs/architecture-v3.md` §"Read/Write Surface Split"** — the architectural decision driving Codex/Scribe split.
4. **`docs/gotcha.md`** — debugging discipline + accumulated priors. Two new lessons from this session worth absorbing:
   - **Rules-of-Hooks violations cost ~3 commits to fix.** Always hoist hooks above conditional returns, never gate hooks behind `if`.
   - **Bulk perl renames miss renderer-side electronAPI method calls.** TypeScript doesn't catch missing keys on `Window['electronAPI']['<key>']` dereferences — they silently resolve to `unknown`. Audit renderer call sites after any preload rename.

---

## Vocabulary shift (Task 1 complete)

| Old | New |
|---|---|
| Library tab | Codex tab |
| Editor tab + EditorPane | Scribe tab + ScribePane |
| Dashboard tab | HUD tab |
| Projects tab | Domaines tab (concept of "project" preserved internally) |
| Holocron (brand, user-visible) | Agenteryx |

**Internal identifiers preserved** as historical/persistent names: `HolocronConfig` type, `holocronRoot` config field, `holocron-bd://` URL scheme, `holocron-default`/`holocron-dark` theme keys, Honcho workspace `'holocron'`, `HOLOCRON_DB_URI` env var, `com.holocron.editor` macOS bundle id, npm package name `holocron-editor`. Renaming these requires backward-compat migration shims — deferred to a future dedicated Agenteryx pass.

**Renamed IPC channels:** `dashboard:*` → `hud:*`, `editor:insert*` → `scribe:insert*`. **Renamed preload methods:** `dashboardStatus/Stats/RecentActivity` → `hudStatus/Stats/RecentActivity`, `editorInsertAtCursor`/`onEditorInsert` → `scribeInsertAtCursor`/`onScribeInsert`. **CSS class** `library-preview-md` → `codex-preview-md`. **Icons:** IconEditor→IconScribe, IconLibrary→IconCodex, IconDashboard→IconHUD, IconSession→IconDomaines.

**Tab key strings** in `sessionStore.AppTab` union: `'editor' | 'sessions' | 'library' | 'dashboard'` → `'scribe' | 'domaines' | 'codex' | 'hud'`. **Default tab on launch is `'hud'`.**

---

## Task 2 — Domaines layer (complete, 8 commits)

Full hierarchy now real: **Domaines → Projects → Threads**. Bridge namespaces (`__library__`, `__inbox__`) always reachable across Domaines per the existing isolation model.

| # | Commit | What |
|---|---|---|
| 1 | `2915113` | Migration 004 + Domaine CRUD + IPC (`rag_domaines` table; `rag_namespaces.domaine_id` FK; backfill all existing namespaces to General; `domaines:list/create/update/delete` + `domaines:project-map` IPCs; `ensureGeneralDomaine` boot guard; `ragIngest.ensureNamespaceRow` updated to seed new namespace rows with General by default) |
| 2 | `4dce21e` | `projects:list/create` scoped by `domaineId` (optional arg; null = legacy "all projects" behavior; `createProject` seeds the namespace row immediately so fresh projects show up before first ingestion) |
| 3 | `2f504aa` | Drill-down UI — Index → Domaine → Project → Threads; new `domainesStore` with view/cursor/history; `DomainesIndex` + `DomaineView` + `ProjectView` + Breadcrumb + `NewDomaineModal` (name + description + 7-color palette) |
| 4 | `5a96a14` | Persist `activeDomaineId` across launches via `HolocronConfig.activeDomaineId`; top-level Domaines dispatcher restores last-viewed Domaine on app start (defensive against deleted ids) |
| 5 | `1a31c77` | `DomaineBadge` component (chip + dot variants) + integrations at TitleBar breadcrumb, Sidebar ThreadSwitcherFooter, Codex/Search ResultCard, CodexPreview MetaLine. `useDomaineForProject` + `useDomaineById` hooks |
| 6 | `f9cfbb0` | Codex Search scoped by Domaine — replaced `crossNamespace` toggle with Domaine selector dropdown + explicit "Across all Domaines" checkbox. SQL clause: `crossDomaine OR domaineId IS NULL OR n.domaine_id = domaineId OR is_bridge_namespace` |
| 7 | `83c66d1` | Codex Wiki filtered by Domaine + migration 005 (adds `rag_wiki_pages.domaine_id` + `domaine_overflow_count` columns) |
| 8 | `4ba0bfa` | Wiki page **dominant** Domaine assignment at compile time + **"+N"** overflow badge; one-shot `backfillWikiDomaines()` runs at boot to populate legacy pages |

**Migrations 004 + 005 must be applied** on first run after pulling this branch:

```
cd editor && npm run db:setup
```

Both migrations are idempotent and auto-discovered by `db-setup.ts`.

**Verified behaviors:**
- Default tab launches at HUD; Domaines/Codex/Scribe all working.
- Domaines drill-down with breadcrumb navigation works.
- Last Domaine restored on relaunch.
- DomaineBadge color dots visible in TitleBar breadcrumb + Sidebar footer.
- Codex Search Domaine selector + "Across all" toggle work; bridge namespaces always reachable.
- Codex Wiki Domaine filter works; cards show dominant Domaine + "+N" when sources span multiple.
- New project creation seeds namespace with chosen Domaine.

---

## Codex/Ingest sub-tab — shipped (commit `7f441af`)

Manual inspection + control panel for the auto-ingestion pipeline. Live in Codex → Ingest.

**What's in it:**
- **Summary row** — documents / tags / relationships / last-ingest timestamp
- **Filter row** — search input, Type select (all/brain_dump/note/report/reference/wiki/inbox), Domaine select, "Across all Domaines" checkbox, Refresh button, **"+ Ingest file…"** button (opens file dialog rooted at `holocronRoot`, workspace-restricted)
- **Documents table** — 8-column grid: status glyph (✓/✗) / Title + filename / Type / Project + DomaineBadge / Tags / Edges / Ingested timestamp / per-row Re-ingest ⟳ button
- **Load more** button when `documents.length < totalDocuments` (200-row pages)
- **Activity log** — collapsible bottom section (collapsed by default); chronological event list from `rag_operations_log` filtered to `operation='ingest'`; ✓/✗/◌ glyphs + relative timestamps + duration
- Row click → `classifyFileRelationship` dispatch → opens in Scribe (active/inbox) or `CodexPreview` overlay (cross-thread/wiki/synthesis)

**Files added/modified in `7f441af`:**
- `editor/src/main/ingestQueries.ts` (new) — three queries: list docs, list activity, get counts
- `editor/src/main/ipc.ts` — 4 new handlers (`ingest:list-documents`, `ingest:list-activity`, `ingest:counts`, `ingest:pick-and-ingest`)
- `editor/src/preload/index.ts` + `editor/src/renderer/src/types/ipc.ts` — bindings + types
- `editor/src/renderer/src/store/ingestStore.ts` (new) — zustand state for tab-switch persistence
- `editor/src/renderer/src/components/codex/Ingest.tsx` (new) — top-level component
- `editor/src/renderer/src/components/codex/CodexTab.tsx` — Ingest sub-tab enabled, ordered Search / Wiki / Ingest / Graph / Syntheses

**Decisions baked in (per Andy's spec):**
1. Activity log collapsed by default — expand only when needed.
2. Manual ingest restricted to files under `holocronRoot` — `detectSourceType` requires workspace-relative paths.
3. No inline delete/inactivate per row — filesystem deletion via chokidar is the canonical path.
4. No "pending" status indicator — Bull queue is in-memory; ingestion is sub-2s in practice.
5. Pagination = 200-row pages with "Load more" — virtualization deferred.

**Re-ingest** reuses existing `ragIngestManual(filePath)` IPC — no new handler.

---

## Three Codex sub-tabs (Andy's plan)

| Sub-tab | Status |
|---|---|
| Search | ✅ shipped (Phase 3a step 7) |
| Wiki | ✅ shipped (commits `f256357` / `7e568fb` + Domaine-aware in commits 7 + 8 of Task 2) |
| **Ingest** | **✅ shipped (`7f441af`)** |
| Graph | ⏳ next — plan before coding |
| Syntheses | ⏳ after Graph |

---

## What comes next — Codex/Graph

Andy's spec (his original message, verbatim):

> A visual relationship graph of the knowledge base. The relationship data already exists in the database — this tab visualizes it.
>
> - Documents as nodes, relationships as edges
> - Nodes sized or colored by connection count (highly connected = more prominent)
> - Nodes grouped or tinted by Domaine using the existing DomaineBadge color system
> - Clicking a node opens that document in CodexPreview
> - Filtering by Domaine (using the same Domaine selector pattern already in Codex Search and Wiki)
> - A search/highlight input to find and focus a specific document in the graph

**Library choice — plan before coding.** No graph library currently in `editor/package.json`. Options:

- **Cytoscape.js + react-cytoscapejs** — handles 1000s of nodes well; batteries-included for graphs; explicitly named in `architecture-v3.md` as the planned choice for the Codex Graph view. **Recommended.**
- **react-force-graph** (built on D3 + Three.js) — easy API, good for medium graphs (~hundreds of nodes), simpler dep tree.
- **D3 directly** — most flexible, most code to write. Probably overkill for a fixed-purpose graph view.

Confirm with Andy before adding any dep. Quick verification: `npm view cytoscape` and `npm view react-cytoscapejs` for current versions; install size acceptable for an Electron app.

**Data shape needed.** Query `rag_relationships` joined to `rag_documents` for nodes (with domaine_id via namespace JOIN) + edges. Sketch:

```sql
-- Nodes
SELECT
  d.id, d.title, d.source_path, d.source_type, d.project_name,
  n.domaine_id,
  (SELECT COUNT(*) FROM rag_relationships
   WHERE document_a_id = d.id OR document_b_id = d.id) AS degree
FROM rag_documents d
LEFT JOIN rag_namespaces n
  ON n.name = COALESCE(d.project_name, '__' || d.source_root || '__')
WHERE d.is_active

-- Edges
SELECT id, document_a_id, document_b_id, relationship, strength
FROM rag_relationships
```

New IPC `graph:fetch` returns `{ nodes: GraphNode[], edges: GraphEdge[] }`. Optional Domaine filter narrows nodes (and the edges between them).

**Click → CodexPreview**: same dispatch pattern as Search/Wiki/Ingest. Reuse `classifyFileRelationship` to decide preview vs Scribe.

---

## What comes after Graph — Codex/Syntheses

Andy's spec (verbatim):

> Active intelligence on top of the knowledge base. Beyond the automatic wiki compilation every 5 ingests, this tab lets Andy trigger on-demand synthesis operations.
>
> - **Domaine summary** — generate a structured briefing on everything in a selected Domaine
> - **Concept extraction** — surface the key concepts and themes across a Domaine or the full knowledge base
> - **Cross-document connections** — find non-obvious relationships between documents that the graph hasn't surfaced
> - **On-demand wiki regeneration** — trigger a wiki compile for a specific Domaine without waiting for the 5-ingest trigger
> - A synthesis history log — what was generated, when, from which documents
>
> Each operation calls the LLM (use the existing provider system — Claude Sonnet or Gemini Flash depending on cost/complexity). Results are displayed in the tab and optionally saved back to the Codex as a new Raw document.

The `rag_syntheses` table already exists in the schema (id, title, query, content, source_doc_ids, captured_back, captured_at, created_at). Plan will need:
- New IPC channels per operation
- LLM prompt templates per operation
- Results UI with save-back control (write to `_Library/Syntheses/<slug>.md`, INSERT into rag_syntheses)

---

## Running infrastructure (verified 2026-05-11)

```
Postgres   localhost:5432   pgvector/pgvector:pg15      container holocron_link-database-1
Redis      localhost:6379   redis:8.2                   container holocron_link-redis-1
Honcho     localhost:8000   custom build                containers holocron_link-api-1 + deriver-1
```

`HOLOCRON_DB_URI` is in `editor/.env`. `npm run db:setup` is idempotent and applies migrations 001–005 in lex order.

---

## Open priors (carry forward, do not touch unless asked)

- **`[ChatDiag]` logs** at four chat-path sites (commit `d15416e`) — still in flight, waiting on Andy's recurrence capture. Do not remove.
- **Fey theme work** in `themes.ts` + `docs/Fey design.md` — intentionally uncommitted in working tree. Do not commit, do not modify. Andy returns to this explicitly when ready.
- **`_Library/` folder** — autogenerated wiki disk artifacts, kept out of git.
- **`tsconfig.web.tsbuildinfo`** — autogenerated by tsc, harmless deletion noise.
- **Internal Holocron→Agenteryx rename** for persistent identifiers (HolocronConfig type, holocronRoot config field, holocron-bd:// scheme, Honcho workspace, env vars, bundle id) — deferred to a future dedicated pass with backward-compat shims.

---

## Recent commits trail (chronological, most recent first)

```
7f441af feat(codex): Ingest sub-tab — inspection + manual control
4ba0bfa feat(domaines): wiki pages get dominant Domaine + "+N" overflow badge
83c66d1 feat(domaines): Codex Wiki sub-tab filtered by Domaine
f9cfbb0 feat(domaines): Codex Search scoped by Domaine
1a31c77 feat(domaines): DomaineBadge + integrations (4 surfaces)
5a96a14 feat(domaines): persist activeDomaineId across launches
2f504aa feat(domaines): drill-down UI — Index → Domaine → Project → Threads
4dce21e feat(domaines): projects:list/create scoped by domaineId
2915113 feat(domaines): migration + backend + IPC for Domaine layer
86f76c0 chore: rename user-visible "Holocron" → "Agenteryx" (labels + product name)
44257c1 fix(hud): HUD calls hudStatus/Stats/RecentActivity (not dashboard*)
01743b3 fix(rename): residual electronAPI + setActiveTab calls missed by sweep
6fd1924 docs: rename Library→Codex, Editor→Scribe, Dashboard→HUD, Projects→Domaines (docs sweep)
b47fe75 refactor: rename Library→Codex, Editor→Scribe, Dashboard→HUD, Projects→Domaines (54 files)
```

**Current branch:** `main`.

**Cleared to plan Codex/Graph.** Don't write code until Andy confirms the library choice (Cytoscape.js is the recommendation per arch-v3) and the IPC shape.
