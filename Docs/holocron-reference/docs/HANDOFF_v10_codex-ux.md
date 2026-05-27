# Handoff v10 — Codex/Graph, Cleanup tools, Ingest UX

**To:** the next Claude session
**From:** prior session 2026-05-11 — shipped the Codex/Graph sub-tab (Cytoscape.js + cola live physics), the Ingest-tab cleanup toolchain (per-row delete, dead-link purge, orphan sweep, health badge), closed the chokidar on-disk-delete gap, made Ingest a stay-in-tab preview surface with sidebar yellow active highlight + a Scribe-toolbar Delete button, and finished with row numbers + split-view preview on wide viewports. Six commits since v09.
**You are starting:** decide between (a) graph physics rewrite (cola → react-force-graph) or (b) first real-content ingestion pass (AstraStrata PRDs). Andy will pick. Then Syntheses.

**Naming convention:** handoffs live in `docs/` as `HANDOFF_vNN_step-X.md`. v10 documents what shipped after v09 (Codex sub-tabs era).

---

## Read order (~15 min)

1. **`docs/STATUS.md`** — refreshed in this session; current as of 2026-05-11.
2. **`docs/architecture-v3.md`** — canonical vision/planning document. Part 2 + Part 6 reflect what's shipped through Phase 0 (partial) + Phase 2 (Domaines complete).
3. **`docs/HANDOFF_v09_codex-subtabs.md`** — the prior chapter (Domaines layer + Codex/Ingest). v10 extends it.
4. **`docs/gotcha.md`** — debugging discipline + accumulated priors. Three new lessons worth absorbing from this session:
   - **Stale-closure in cytoscape event handlers** — handlers bound once on mount capture initial state. Use a ref mirror (`openNodeRef`) so dbltap reads fresh data instead of the empty array captured at first render.
   - **StrictMode double-mount + `handlersBound.current` ref = dead handlers.** Effects that gate themselves with a persistent ref survive the strict-mode cleanup; the *second* cy instance never gets handlers wired. Bind handlers inside the cy-creation effect so they live and die with the instance.
   - **Cytoscape canvas needs `position: relative` on its direct container.** Without it, the absolute-positioned canvas resolves against the next positioned ancestor and may bleed under sibling panels (e.g. a right rail). Always set `position: relative; overflow: hidden; minWidth: 0; minHeight: 0` on the container div.

---

## Commits shipped this session (chronological)

### `8cc9c3e` — docs(arch-v3): Part 2 + Part 6 updates

Marked the trust-layer items that have shipped:
- **Part 2 #3 (Wiki markdown rendering)** — ✅ fixed (Codex Wiki sub-tab + Domaine awareness in Task 2 commits 7-8).
- **Part 2 #4 (Namespace visibility)** — ✅ fixed via Domaines layer (drill-down UI + DomaineBadge across 4 surfaces).
- **Part 2 #5 (Ingestion status)** — ✅ fixed (Codex/Ingest sub-tab `7f441af`).
- **Part 6 Phase 0** — 2/4 done (wiki render + namespace badges); Clear button + context display pending.
- **Part 6 Phase 2** — items 1 + 4 done (Domaines hierarchy + UI surfacing); document lifecycle states + batch import pending.

### `88e0891` — feat(codex): Graph sub-tab (initial)

Visual relationship graph at Codex → Graph. Three new files + IPC wiring:

- `editor/src/main/graphQueries.ts` (new) — `fetchGraph(args)` two-pass query: scoped nodes CTE (Domaine filter via namespace JOIN, bridge namespaces always included), then edges restricted to pairs where both endpoints are in the scoped set. Degree computed only among scoped nodes — what the user sees is a closed sub-graph, no dangling edges.
- `graph:fetch` IPC + preload + renderer types.
- `editor/src/renderer/src/store/graphStore.ts` (new) — zustand. Persists nodes/edges/filters (`crossDomaine`, `showOrphans`, `highlightQuery`), selection, preview overlay. Survives tab switches.
- `editor/src/renderer/src/components/codex/Graph.tsx` (new) — initial implementation used `cytoscape-fcose` (static geometric layout). Node size by degree, color by Domaine via `DomaineInfo.color`, edge thickness by relationship strength. Single click → select + right rail; double click → open in CodexPreview/Scribe via `classifyFileRelationship` dispatch. Highlight search dims non-matches. Show-orphans toggle on by default. Edge tooltips on hover.
- `CodexTab.tsx` — Graph sub-tab enabled, render line added.

**Deps added:** `cytoscape`, `react-cytoscapejs`, `cytoscape-fcose`, `@types/cytoscape`.

### `2436626` — feat(codex/graph): live physics + click handler + canvas fixes

User feedback after `88e0891`: graph felt static and dead, clicks didn't open the rail, double-click didn't open the doc, canvas didn't fill wide viewports. Three fixes:

1. **Physics swap** — `cytoscape-fcose` → `cytoscape-cola`. `infinite: true` continuous force sim, native cytoscape grabify-on-nodes makes drag-and-react free (grabbed node pinned during drag, neighbors pulled via springs). Tuned `edgeLength: 90`, `nodeSpacing: 20`, `unconstrIter: 10`, `avoidOverlap: true`, `handleDisconnected: true`, `maxSimulationTime: 4000`. Settles in ~4s, stays interactive. Added **"Re-layout"** button next to Refresh as an escape hatch when the sim gets stuck.
2. **Click handler fix** — root cause was StrictMode double-mount: `handlersBound.current = true` ref survived the cleanup, so the second cy instance never got handlers. Compounded by `openNode` closure capturing the empty initial `nodes` array, so even when dbltap fired it found nothing. Fix: move all handler binding into the cy-creation effect (handlers tied to cy lifecycle), and mirror `openNode` via `openNodeRef` so closures always read current state.
3. **Canvas sizing** — added `position: relative` + `overflow: hidden` + `minWidth: 0` / `minHeight: 0` on the container div. Added a `ResizeObserver` that calls `cy.resize()` on panel/window resize. First-load fit deferred to `requestAnimationFrame` so the container has real computed dimensions when measured.

**Deps swap:** added `cytoscape-cola`, removed `cytoscape-fcose`.

**KNOWN CAVEAT:** I have not seen the graph at runtime. `tsc --noEmit` + `npm run build` clean, but the click and physics fixes were not visually verified. Cola was confirmed as the minimum-churn fix vs. a full react-force-graph rewrite; if it still feels off, the alternative is ~300 lines of churn (see "Carry-forward items" below).

### `fc386fa` — feat(ingest): cleanup tools + chokidar unlink

Andy should never need to open a database client to maintain the system.

**New module — `editor/src/main/cleanupOps.ts`:**
- `deleteDocument(sourcePath)` — `fs.unlink` (best-effort, ENOENT swallowed) + `DELETE FROM rag_documents WHERE source_path` (CASCADE handles `rag_document_tags`, `rag_relationships`, `rag_wiki_page_sources`) + orphan sweep. Idempotent.
- `scanDeadLinks()` — read-only. `Promise.all(fs.promises.access(...))` against every active doc's `source_path`. Returns the rows whose file is gone.
- `purgeDeadLinks(ids?)` — bulk delete + orphan sweep.
- `scanOrphans()` — read-only counts of orphan tags + sourceless wiki pages.
- `sweepOrphans()` — deletes orphan `rag_tags` rows + sourceless `rag_wiki_pages` rows. For each deleted wiki page, also unlinks `_Library/Wiki/<slug>.md` from disk.
- `runHealthScan()` — combined probe for the summary-row badge.

**Chokidar gap closed:** `workspace.ts` previously only wired `'add'` / `'change'`. The v09 handoff claimed "filesystem deletion via chokidar is the canonical path" — that claim was **not actually implemented**. Now fixed:
- `FileChangeType` widened to `'add' | 'change' | 'unlink'`.
- `watcher.on('unlink', …)` fires on disk deletes.
- `ragIngest.onFileEvent` branches on type — unlinks route to `cleanupOps.deleteDocument`, cancelling any pending debounce. Same idempotent path as the in-app trash button, so `rm` from terminal and Finder Move-to-Trash both converge on identical cleanup.

**Six new IPCs** (`ingest:delete-document`, `ingest:scan-dead-links`, `ingest:purge-dead-links`, `ingest:scan-orphans`, `ingest:sweep-orphans`, `ingest:health-scan`) + preload bindings + renderer types.

**UI (`Ingest.tsx`):**
- **Per-row trash button** in a new last column. `window.confirm` → `ingestDeleteDocument` → refresh list + health.
- **Health badge** as 5th stat in the summary row — 🟢 Clean / 🟡 N issues / ◌ Scanning… with a tooltip breakdown (`orphan tags · dead links · sourceless wiki pages`).
- **Two conditional cleanup buttons** in the filter row (amber pill style) — only appear when the corresponding count is non-zero: "Purge N dead links" and "Sweep N orphans". One-shot purge-all with count surfaced before `window.confirm`.

**Other:**
- `ragWiki.wikiDiskPath` exported so cleanupOps can unlink the disk artifact.
- New `IconTrash` SVG matching the monochromatic Icons set.
- `ingestStore` gains `health` + `healthLoading` state, persisted across tab switches.

### `ce14db0` — feat(ux): Ingest preview overlay, sidebar active highlight, Scribe delete

Three UX fixes converging on the cleanup pipeline.

**Ingest — always preview inline:**
- Row click used to dispatch active/inbox docs to Scribe via `classifyFileRelationship` → `openFileWithContent`, yanking the user out of the tab. Now every click opens `CodexPreview` inline, regardless of relationship. User stays in Ingest while inspecting any document. "Open in Scribe" inside the preview is the explicit way out.
- `CodexPreview` gained an optional `onDelete` prop. When provided, renders a danger-pill Delete button (red `#ff2d78`) at the end of the toolbar. Caller owns confirmation + the destructive call.
- Ingest wires `onDelete → handleDelete(doc)`. `handleDelete` now also calls `useScribeStore.getState().closeFile(sourcePath)` so any open Scribe tab pointing at the deleted file is closed (no stale buffers), and closes the preview overlay when the delete came from inside it.

**Sidebar — active-in-Scribe highlight in file tree:**
- `SidebarCell` reads `activeFilePath` from `useScribeStore`. Currently-open Scribe file gets `--neon-yellow #ffd60a` accent on its tree row — background tint (`rgba(255,214,10,0.10)`), 2px left border, filename color + IconFile color, font-weight 600. Wins over keyboard `isSelected` styling when both apply to the same row.

**Scribe — Delete button in DocumentToolbar:**
- Third toolbar button (after `+ Version`, `☰ Contents`) using `IconTrash` SVG with a danger pill treatment (pink #ff2d78 tint, matching Ingest trash). Confirms → `ingestDeleteDocument` → `closeFile` → `triggerSidebarRefresh`. Reuses the **exact same backend path** as Ingest trash + chokidar unlink. One source of truth for destruction across three surfaces (Ingest table, preview, Scribe toolbar).
- `ToolbarButton` extended with a `danger` variant; `label` widened to `ReactNode` so the SVG icon sits beside the text.

**ragWiki defensive assert:**
- `writeWikiToDisk` refuses any resolved path that doesn't contain `/_Library/Wiki/`, logging a loud error instead. Insurance against a future `holocronRoot` mis-config silently scattering wiki output into thread directories. **Current compile path verified correct** — every active slug.md file is at `_Library/Wiki/`. The assert is a one-line safety net.

### `d1d36da` — feat(ingest): row numbers + split-view preview

Two UX improvements for navigating large document lists.

**Row numbers:**
- New first column in the docs table (40px, right-aligned, monospace, tabular-nums). Sequential 1..N based on SQL `ORDER BY ingested_at DESC`. Stable across "Load more" — appended rows extend the bottom of the list without shifting earlier positions.
- `CodexPreview` gained optional `position: { current; total }` prop. When present, the header `MetaLine` renders **"Document N of M"** — for wiki/synthesis modes it leads the italic subtitle; for the other modes it sits as the first chip in the meta line, monospace numbers.
- Ingest computes `current = documents.findIndex(...) + 1` and `total = totalDocuments` (the full filter total, not just the loaded subset, so the indicator stays stable across Load more).

**Split-view preview:**
- At ≥1200px viewport, preview opens as a 60% right pane beside the 40% list instead of covering it. User keeps the full list + row numbers visible while inspecting any document. 1px `--border-subtle` divider between them.
- Below threshold, existing overlay behavior preserved: preview replaces the body, Summary + Filter + Activity stay outside.
- Threshold detected via `window.matchMedia('(min-width: 1200px)')` with a `change` listener — resizing the window across the cutoff swaps the layout live, no reload needed.
- **Active row indicator:** the row backing the preview gets `--neon-blue` left border + `--bg-selected` background + bold neon row number. List↔preview correspondence is visible at a glance in split mode.
- **Close behavior:** preview close (✕ / Back / Delete) collapses the right pane back to a full-width list. No auto-advance — explicit row click only.

---

## Files added / modified in this session

```
editor/src/main/cleanupOps.ts                                 NEW (fc386fa)
editor/src/main/graphQueries.ts                               NEW (88e0891)
editor/src/main/ipc.ts                                        MODIFIED — 6 cleanup + 1 graph IPC
editor/src/main/ragIngest.ts                                  MODIFIED — unlink branch in onFileEvent
editor/src/main/ragWiki.ts                                    MODIFIED — wikiDiskPath exported + assert
editor/src/main/workspace.ts                                  MODIFIED — FileChangeType widened
editor/src/preload/index.ts                                   MODIFIED — graph + cleanup bindings
editor/src/renderer/src/components/Icons.tsx                  MODIFIED — IconTrash added
editor/src/renderer/src/components/codex/CodexPreview.tsx     MODIFIED — onDelete + position props
editor/src/renderer/src/components/codex/CodexTab.tsx         MODIFIED — Graph enabled
editor/src/renderer/src/components/codex/Graph.tsx            NEW (88e0891) + restructured (2436626)
editor/src/renderer/src/components/codex/Ingest.tsx           MODIFIED — cleanup + UX + split view
editor/src/renderer/src/components/layout/SidebarCell.tsx     MODIFIED — isActiveInScribe accent
editor/src/renderer/src/components/scribe/DocumentToolbar.tsx MODIFIED — Delete button
editor/src/renderer/src/store/graphStore.ts                   NEW (88e0891)
editor/src/renderer/src/store/ingestStore.ts                  MODIFIED — health state
editor/src/renderer/src/types/ipc.ts                          MODIFIED — graph + cleanup types
editor/package.json + package-lock.json                       cytoscape* deps
docs/architecture-v3.md                                       MODIFIED (8cc9c3e)
```

**Deps net change:** `+cytoscape`, `+react-cytoscapejs`, `+cytoscape-cola`, `+@types/cytoscape` (cytoscape-fcose added in 88e0891, removed in 2436626).

---

## Codex sub-tab status

| Sub-tab | Status |
|---|---|
| Search | ✅ shipped + Domaine-scoped |
| Wiki | ✅ shipped + Domaine-aware |
| Ingest | ✅ shipped + cleanup tools + split view + row numbers |
| **Graph** | ✅ shipped (cola live physics) — **see caveat below** |
| **Syntheses** | ⏳ next-after-next — still grayed out, `enabled: false` in `CodexTab.tsx` |

---

## Carry-forward items — read before picking up work

### 1. Graph physics: cola is a placeholder, may need rewrite

The cola swap (`2436626`) was chosen for minimum churn — it kept the existing stylesheet, event handlers, classifyFileRelationship dispatch, right rail, and preview overlay intact. ~80 line diff vs. a full rewrite.

**However:** I have not visually verified that cola actually feels alive at runtime. The user described wanting the "Obsidian brain" look — d3-force is the canonical lib for that aesthetic. If cola doesn't deliver after Andy actually tries it:

- **Alternative:** rewrite Graph.tsx to use `react-force-graph-2d` (d3-force under the hood). ~250-350 line rewrite. Loses the cytoscape stylesheet/class system; canvas pan/zoom done by the lib. Right rail + preview overlay carry over; node-click + drag handlers are simpler props.
- Don't dabble — full commit either way.

**Also unverified:** the click handler fixes (`tap` → rail, `dbltap` → open) and the ResizeObserver-driven canvas sizing. Both are structurally correct based on cytoscape docs + StrictMode behavior, but Andy needs to confirm in `npm run dev`.

### 2. 2612 relationships / 22 docs anomaly

Verified live (2026-05-11): `rag_documents` (active) = 22, `rag_tags` = 145, `rag_relationships` = **2612**, `rag_wiki_pages` = 0.

That's ~119 edges per doc against a theoretical max of C(22,2) = 231 pairs. The corpus is almost entirely synthetic smoke-test documents that were ingested under the `recomputeTagOverlap` logic without the namespace gate, then partially cleaned. **The anomaly is expected — it will normalize once test docs are deleted and real content is ingested.** Do not pre-emptively try to fix the relationship count; it's an artifact, not a bug.

The cleanup tools shipped in `fc386fa` are the right tool for the job: per-row trash, dead-link purge, orphan sweep.

### 3. Real AstraStrata ingestion is the next big test

The arch-v3 §"Phase 1: Real Content Validation" protocol is unchanged and still mandatory:

- Write expectations down before ingesting (what tags, what relationships, what wiki pages).
- Ingest in stages — start with 10-15 AstraStrata docs, stop, evaluate.
- Watch for the four failure modes: tag collapse, relationship sparsity, wiki drift, namespace leakage.

The validation test: after the first wiki compiles, ask it a real operational question (not a test question). A good answer cites your documents, surfaces a connection you didn't make, confabulates nothing.

**This is the highest-leverage next move after Andy decides whether the Graph physics is good enough.**

### 4. Syntheses sub-tab still grayed out

Andy's spec for Syntheses is captured verbatim in v09 ("What comes after Graph — Codex/Syntheses"). Four operations: Domaine summary / concept extraction / cross-document connections / on-demand wiki regeneration. Results display in-tab, optionally save back to Codex as Raw documents via `_Library/Syntheses/<slug>.md` + `rag_syntheses` row.

`rag_syntheses` table already exists in schema. New IPCs per operation, LLM prompt templates per operation, results UI with save-back control. Plan before coding.

### 5. Combined graph + analytics prompt (InfraNodus-inspired) — planned but not sent

Andy has a planned/drafted prompt extending the Graph tab with InfraNodus-style analytics (community detection, centrality, contradiction scoring overlay). **Not yet sent to Claude Code.** When Andy delivers it, it'll likely live as a Graph sub-pane or a new Codex sub-tab. Don't pre-emptively scaffold for it — wait for the spec.

### 6. Open priors from v09 still applicable

- `[ChatDiag]` logs in 4 chat-path sites (commit `d15416e` from earlier) — still in flight, waiting on Andy's recurrence capture. **Do not remove.**
- Fey theme work in `themes.ts` + `docs/Fey design.md` — intentionally uncommitted, deferred. **Do not commit, do not modify.**
- `_Library/` folder — autogenerated wiki disk artifacts, kept out of git.
- `tsconfig.web.tsbuildinfo` — autogenerated by tsc, harmless deletion noise.
- Internal Holocron→Agenteryx identifier rename — deferred to a future dedicated pass with backward-compat shims.

---

## Running infrastructure (verified 2026-05-11)

```
Postgres   localhost:5432   pgvector/pgvector:pg15      container holocron_link-database-1
Redis      localhost:6379   redis:8.2                   container holocron_link-redis-1
Honcho     localhost:8000   custom build                containers holocron_link-api-1 + deriver-1
```

`HOLOCRON_DB_URI=postgresql://postgres:postgres@localhost:5432/holocron_rag` in `editor/.env`. `npm run db:setup` is idempotent and applies migrations 001–005 in lex order.

For direct DB inspection: `docker exec holocron_link-database-1 psql -U postgres -d holocron_rag -c "…"` (the `psql` CLI is not installed on the host; the container has it).

---

## Recent commits trail (chronological, most recent first)

```
d1d36da feat(ingest): row numbers + split-view preview on wide viewports
ce14db0 feat(ux): Ingest preview overlay, sidebar active highlight, Scribe delete
fc386fa feat(ingest): cleanup tools — delete docs, purge dead links, sweep orphans
2436626 feat(codex/graph): live physics + fix click handlers + canvas sizing
88e0891 feat(codex): Graph sub-tab — Cytoscape.js relationship visualization
8cc9c3e docs(arch-v3): mark wiki render, Domaine badges, ingest status fixed
2e2436d docs: HANDOFF_v09 + STATUS refresh + architecture-v3 reference rename   ← v09 boundary
```

**Current branch:** `main`. **Working tree non-empty** (per open-priors above): `themes.ts`, `_Library/`, `docs/Fey design.md`, `tsconfig.web.tsbuildinfo`. Leave alone unless Andy asks.

---

## Hand-off — what to do next

Decide with Andy:

**Option A — Graph physics rewrite (cola → react-force-graph).** Only if cola's "alive" quality falls short in actual use. Full rewrite of Graph.tsx, ~250-350 line diff. Drop cytoscape entirely or keep both for different sub-tabs. Plan first.

**Option B — Real AstraStrata ingestion pass.** The validation protocol in arch-v3 §"Phase 1: Real Content Validation" is the highest-leverage move once the trust layer holds up. ~10-15 PRD documents, staged ingestion, evaluate before adding more. Use the new cleanup tools liberally between stages.

**Then:** Syntheses sub-tab.

**Then:** the InfraNodus-style graph analytics overlay when Andy delivers the prompt.

Don't write code on any of these until Andy chooses a path and confirms the plan.
