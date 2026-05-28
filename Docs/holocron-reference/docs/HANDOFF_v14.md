# Handoff v14 — Architecture-v4 Session 1 + iCloud / `_Codex` rename + graph polish

**To:** the next Claude session
**From:** prior session 2026-05-13 — a long session that opened the architecture-v4 roadmap by shipping Session 1 (graph analytics + the Syntheses tab) and then kept going across the rest of the surface area: iCloud-ready library path + `_Library → _Codex` rename, wiki tier-2/tier-3 title fix, rename → wiki recompile (live + boot reconciliation), graph counter-scale + zoom max 8× + hierarchy edges + label visibility ladder + halo-as-selection-indicator + click-to-pan-center, "Domaine" → "Domain" UI labels, context menu portal fix, ingest citation source fetch, ingest preview link delegation, Ingest header compaction, NodeDetailRail duplicate-key fix, alphabetical thread/project sort, Reset view button, divider chevrons centered, Lucide-style icon swap in CodexPreview.
**You are starting:** the MVP + v13 baseline is intact; the Syntheses tab is now `enabled: true` with a live analytics panel; the graph reads as a clear constellation with counter-scaled nodes/labels/edges, a hierarchy skeleton connecting wiki tiers to documents, and a progressive label-fade ladder. `_Codex` is the cache root on disk and surfaced in Settings → Connections as "Codex Cache" (config key `libraryPath` kept for source-stability). Wiki page titles + slugs no longer carry `_project` / `_domaine` sentinels — boot purges any pre-rename residue. Thread + project renames invalidate the affected wiki pages and re-bootstrap them; first-boot reconciliation catches renames that happened before this wiring landed.

---

## 🛑 READ FIRST — verification rules carried over

`npx tsc --noEmit` from the editor root is a **no-op** (root tsconfig `"files": []` + project references). `tsc -b` **emits** `.d.ts`/`.js` into the source tree. Never use either.

**Use `npm run typecheck`** — script is `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`. The `&&` short-circuits — if the node side has any error (and there are pre-existing ones), the web tsc never runs. To verify the renderer alone: `npx tsc --noEmit -p tsconfig.web.json`.

**Main-process changes don't hot-reload.** Renderer hot-reloads; anything under `src/main/` needs a full `npm run dev` cycle. Boot logs (`[Boot] Workspace roots resynced`, `[Boot] wiki bootstrap`, `[Boot] wiki zombie sweep`, `[Boot] legacy sentinel purge`, `[Boot] wiki slug reconciliation`) confirm fresh code.

**`npm run test`** = 28 vitest tests against a real test Postgres + per-test temp fs. ~2 s. **Still 28/28 at session end.**

### Pre-existing tsc errors (unchanged this session, still tabled for v4 Session 8)

| File | Line(s) | Code | Note |
|---|---|---|---|
| `src/main/cleanupOps.ts` | 517 | TS2322 | `withRagClient` returns `number\|null`; line drift from new code |
| `src/main/convert.ts` | 20, 29 | TS2339 | mammoth + pdf-parse runtime quirks |
| `src/main/dashboard.ts` | 54 | TS18047 | `res.rowCount` nullable |
| `src/main/ipc.ts` | 304 | TS2345 | `path.basename` in `.map(...)` |
| `src/main/ragIngest.ts` | 228 | TS2339 | `config.gemini` not on `HolocronConfig` |
| `src/renderer/src/components/chat/ChatMessage.tsx` | 67 | TS2353 + TS7031 | react-markdown component override |
| `src/renderer/src/components/codex/CodexPreview.tsx` | 1419, 1518 | TS2345 + TS2352 | ScribeColorTheme + ReactPortal |
| `src/renderer/src/components/hud/HUD.tsx` | 50 | TS2367 | `'dashboard'` literal vs `AppTab` |
| `src/renderer/src/components/scribe/selectionObserver.ts` | 14 | TS2344 | PluginValue |

Filter typecheck output for files YOU touch. Don't fix the above unless explicitly tasked — Session 8 in `architecture-v4.md` is the dedicated triage pass.

---

## Read order (~20 min)

1. **`docs/STATUS.md`** — refresh after reading this handoff
2. **This file** (HANDOFF_v14)
3. **`docs/architecture-v4.md`** Part 12 — Sessions 2–8 sequence
4. **`docs/gotcha.md`** — refreshed with two new entries (Vite cache, click-to-zoom)
5. **`docs/HANDOFF_v13.md`** — prior chapter (three-tier wiki, Domaines CRUD heal, d3-force graph, vitest suite)

---

## Decisions locked at session start (do not relitigate)

- **Q1 — graphology vs. hand-rolled.** Use `graphology` + `graphology-metrics` + `graphology-communities-louvain`. ~50–80 KB, main-process only (does not ship to renderer bundle). Hand-rolling Louvain would burn a day debugging modularity convergence.
- **Q9 — Synthesis-document generation.** **On-request only** for Session 1. The Syntheses tab surfaces gaps; the "Write synthesis · S3" button is wired but stubbed. Sonnet-written bridge documents land in Session 3.
- **Q10 — Migration 008 timing.** Shipped this session, not deferred to Session 3. Empty columns cost nothing.

---

## Chapter 1 — Architecture-v4 Session 1: Graph analytics + Syntheses tab

### Graph analytics computation layer (`src/main/graphAnalytics.ts`)

Pure-main-process module that reads `rag_documents` + `rag_relationships` via the same `fetchGraph()` scope-resolution the Graph tab uses, builds a `graphology` `UndirectedGraph`, and returns:

- **`communities`** — Louvain partitions with heuristic auto-naming (top 1–2 tags joined with `+`, dropping anything in <25% of members; AI-Sonnet renaming is Session 3). Each carries `id`, `name`, `memberIds`, `memberCount`, the `domaineIds`/`domaineNames` it spans, and `topTags`.
- **`topByBetweenness`** — top-N influential documents by **normalized Brandes betweenness centrality**. Unweighted Brandes — we want "structural bridges by topology," not weighted-shortest-path bridges (`strength` is similarity, not distance; using it as edge weight would invert the semantic).
- **`structuralGaps`** — pairs of communities with the lowest inter-cluster connectivity, formula `(cardA × cardB) / (1 + interEdgeCount + interEdgeWeightSum)`. Singletons excluded. Each gap has a stable `id` (`gap:<smallerCommunityId>-<largerCommunityId>`) suitable for `rag_syntheses.gap_id`.
- **`topicalDiversity`** — Shannon entropy of the community-size distribution, normalized by `log(communityCount)` to give 0..1. Bands `<0.4 = focused`, `0.4–0.7 = balanced`, `>0.7 = scattered`. Plain-language `recommendation` built from the actual numbers.
- **`metrics.degenerate`** — true when corpus has <2 nodes or 0 edges. UI renders an empty state instead of misleading constellation.

Helpers: duplicate-edge merge (accumulates weight), self-loops dropped (Brandes barfs), tag loading is a single SQL pass keyed off scoped ids.

Exposed via `ipcMain.handle('graph:analytics', …)` → `window.electronAPI.graphAnalytics({ domaineId, crossDomaine, topInfluential, topGaps })`.

### Migration 008 — `rag_syntheses` v4 schema

`scripts/migrations/008_syntheses_v4.sql`. Idempotent ALTER TABLE pattern. New columns: `synthesis_type`, `source_clusters JSONB`, `gap_id`, `dream_id`, `disk_path`, `domaine_id UUID REFERENCES rag_domaines(id)`. Dropped `NOT NULL` on `query` (agent-written syntheses have no originating query). Indexes on `domaine_id` / `synthesis_type` / `disk_path`.

`disk_path` was originally `_Library/Syntheses/<slug>.md` per architecture-v4 §7.5; now `_Codex/Syntheses/<slug>.md` after the rename later in this session.

### Syntheses tab enabled (`src/renderer/src/components/codex/Syntheses.tsx`)

`CodexTab.tsx` flipped `syntheses` to `enabled: true`. Cards:

- **Topical diversity** — score 0–100, band (color-coded), modularity, community count, largest-cluster share %, recommendation paragraph.
- **Community clusters** — every Louvain partition with name, member count, Domain badges (highlighted cyan when cluster spans >1 Domain — the high-value kind), top tags.
- **Most influential documents** — top 10 by BC as horizontal bars with Domain badge + 3-decimal BC value.
- **Structural gaps** — top 5 pairs with cluster A ↔ cluster B, bridging-edge count, gap size, "Write synthesis · S3" stub button (surfaces the gap id; real generation in Session 3).

Scope toggles match Codex pattern: per-Domain `<select>` + "Across all" checkbox; Refresh button re-runs the IPC. Cached in `synthesesStore` (Domain filter persists across tab switches).

### Graph theme — Cell vs Constellation

`graphStore.ts` extended with `graphTheme: 'cell' | 'constellation'` (default `'constellation'`), `perNodeAnalytics`, `maxCommunityId`. `Graph.tsx`:

- `refresh()` fires `graphAnalytics` after the topology fetch (best-effort).
- `useConstellation` boolean — `true` only when theme is constellation AND analytics arrived. Brief fallback to Cell visuals before analytics return.
- **Color:** Constellation → HSL-stepped soft palette by community id (s=0.45, l=0.62 — muted, no community dominates by hue).
- **Size:** `nodeRadiusForMetric(cls, t)`. Constellation uses `BC/maxBC` clamped to a 6% floor.
- Theme `<select>` in the Graph toolbar.

### Collapsible CodexPreview header

`CodexPreview.tsx` — two-mode header:

- **Collapsed** (default on every new doc): 40px slim bar with Back button, doc title (truncated, click = expand), and icon-only actions (Edit in Scribe, Import to Thread, Delete, expand chevron). No metadata, no breadcrumb, no Contents — content immediately visible. Error strip appears beneath on failures.
- **Expanded**: full header — nav cluster, large title, MetaLine, SectionNav (wiki/synthesis), labeled toolbar. Top-right collapse chevron.

Reset to collapsed whenever `doc.source_path` or `doc.slug` changes. New `IconAction` helper (28×28, transparent bg, subtle border, glyph + tooltip; `danger` variant tints to `#ff2d78`).

---

## Chapter 2 — iCloud-ready library path + `_Library` → `_Codex` rename

### `libraryPath` config key + helpers (`src/main/config.ts`)

New `HolocronConfig.libraryPath: string`. Empty = derive at use site; non-empty = explicit (typically iCloud Drive). `syncWorkspaceRoots()` extended to:

1. Materialize the default (`<dirname(holocronRoot)>/_Codex`) when `libraryPath` is empty, so first boot writes the explicit value into config.
2. Heal a legacy `libraryPath` still ending in `/_Library` to `/_Codex` (transitional self-heal — `healLegacyLibraryPath()`).

New exports: `deriveDefaultLibraryPath(root)`, `getLibraryRoot(cfg)`, `getWikiCacheDir(cfg)`. All sites that previously inlined `path.join(path.dirname(root), '_Library', 'Wiki')` now route through these:

- `ragWiki.ts:wikiDirPath()` — disk write path
- `graphQueries.ts:fetchGraph` — wikiPrefix for source_path join
- `ingestQueries.ts:listIngestedDocuments` — wiki-row provenance join
- `cleanupOps.ts:deleteZombieWikiDocs` — guard substring (now anchored on getWikiCacheDir; falls back to legacy substring as transitional)

### Settings → Connections → "Codex Cache" panel (`ConnectionsTab.tsx`)

New section beneath "Agenteryx Root". Shows the resolved path (explicit or derived via client-side mirror `deriveLibraryPathClientSide`). Picker writes `libraryPath`. "Reset" button (visible only when explicit) clears the value so it falls back to derivation. Existence-check warning when the folder doesn't exist yet. Help text explains the cache contents and the iCloud Drive use case.

### `_Library` → `_Codex` rename throughout

Sentinel folder rename, applied to:

- **Source code:** `config.ts` (default derivation), `ragIngest.ts` (`RE_WIKI`/`RE_LIBRARY` + `RE_WIKI_LEGACY`/`RE_LIBRARY_LEGACY` transitional fallbacks; SQL `LIKE '%_Codex/Wiki/'` + transitional `_Library` branch; unlink-path regex tests), `cleanupOps.ts` (`getWikiCacheDir`-anchored substring with `_Library/Wiki/` retained as labeled transitional fallback), `ragWiki.ts` (defensive write check anchored on `wikiDirPath()` with both substrings as belt-and-suspenders).
- **Renderer:** `Wiki.tsx` + `CodexPreview.tsx` (synthetic source_path strings + slug-extract regex now match either prefix), `settingsStore.ts` (JSDoc), `ConnectionsTab.tsx` (`deriveLibraryPathClientSide` + Section title "Codex Cache" + help text).
- **Comments:** swept across `maintenance.ts`, `index.ts`, etc.
- **Tests:** `tests/ingest-filter.test.ts` (4 `_Library/Wiki/` paths) and `tests/wiki-bootstrap.test.ts` (3 paths + the temp-dir setup). All 28 tests pass on the new paths.
- **Docs:** STATUS.md + gotcha.md updated. Architecture-v4 / architecture-v2 / phase-3a-execution / PHASE_1_VALIDATION left alone (historical / legacy / paused).
- **Skipped per spec:** migration SQL files (historical); HANDOFF docs (this v14 was written post-rename, so no transitional fallback needed in its references).

### v14→v15 transitional fallbacks

Every regex / SQL / substring that previously matched `_Library/Wiki/` now has `_Codex/Wiki/` as the primary check and the original as a labeled `// transitional v14→v15 fallback` branch. Safe to drop in a future cleanup once no pre-rename paths exist anywhere (Session 8 code-health pass is a natural home).

---

## Chapter 3 — Wiki tier-2 / tier-3 naming fix

### The bug

Tier-2 (project) wiki page disk file was `<dn>/<pn>/_project.md` and tier-3 (domaine) was `<dn>/_domaine.md`. The reingestAsWiki loop-back creates a `rag_documents` row whose `title = path.basename(filePath).replace(/\.md$/, '')` → literally `_project` and `_domaine`. Graph node labels (which read `rag_documents.title`) showed `_project` / `_domaine` instead of `AstraStrata` / `AI_Dev`.

### The fix

- **`compileProjectWiki`**: `title: titleCase(p.projectName)` (was `'${titleCase(p.projectName)} · Project Overview'`).
- **`compileDomaineWiki`**: `title: titleCase(d.domaineName)` (was `'${titleCase(d.domaineName)} · Domaine Overview'`).
- **`projectSlugFor`**: returns `<dn>/<pn>` (was `<dn>/<pn>/_project`). Segment-count is now the tier discriminator (3 = thread, 2 = project, 1 = domaine) so collisions across tiers are structurally impossible.
- **`domaineSlugFor`**: returns `<dn>` (was `<dn>/_domaine`).
- **`reingestAsWiki(diskPath, wikiPageTitle)`**: new second arg. After processIngest runs, `UPDATE rag_documents SET title = $1 WHERE source_path = $2 AND source_type = 'wiki'` — overwrites the filename-derived title with the actual wiki page title. Best-effort, non-fatal.
- **`compileFromSources`**: now passes `args.title` through to `reingestAsWiki`.
- **`tests/wiki-bootstrap.test.ts`**: seed slugs updated to `astra/proj-a` and `astra` (was `astra/proj-a/_project` and `astra/_domaine`).

### Boot self-heal — `purgeLegacySentinelWikiPages()`

Andy's DB had 4 pre-rename rows (3× `_project`, 1× `_domaine`). New cleanupOps function: `DELETE FROM rag_wiki_pages WHERE slug LIKE '%/_project' OR slug LIKE '%/_domaine' OR slug = '_domaine'`. For each, unlink the disk file + drop the rag_documents loop-back row + sweep orphan tags. Idempotent — no-op once clean. Wired into `index.ts` boot **before** `bootstrapMissingPages` so the next bootstrap fills in the corrected slugs.

---

## Chapter 4 — Rename → wiki recompile + boot reconciliation

### The bug

After `renameThread` or `renameProject`, the wiki page row in `rag_wiki_pages` kept its old slug (slugs encode the folder path; rename invalidates them). The SQL inside the rename handlers updated `rag_documents.project_name` / `thread_name` / `source_path`, but didn't touch `rag_wiki_pages`. Result: orphaned wiki rows + stale titles in the Graph.

### The fix

- **`cleanupOps.ts`**: new public `deleteWikiPageBySlug(slug)` — drops the rag_wiki_pages row + unlinks disk + drops the rag_documents loop-back row + sweeps orphan tags.
- **`ragWiki.ts`**: `slugComponent()` made `export` so projectFs can compute old slugs without duplicating slugification.
- **`projectFs.ts:renameThread`**: after the SQL UPDATE succeeds, compute the old tier-1 slug = `${slugComponent(domaineName)}/${slugComponent(projectName)}/${slugComponent(oldName)}`, call `deleteWikiPageBySlug(oldSlug)`, fire-and-forget `bootstrapMissingPages()` to recompile.
- **`projectFs.ts:renameProject`**: same pattern, but find ALL tier-1 pages under the old project (`slug LIKE '${dnSlug}/${oldPnSlug}/%'`) + the tier-2 page itself, delete them all, fire-and-forget bootstrap.

### Boot reconciliation — `reconcileWikiSlugs()`

Belt-and-suspenders for renames that happened BEFORE this wiring landed. Builds the SET of currently-valid `(dn_slug, pn_slug, tn_slug)` tuples from `rag_documents JOIN rag_namespaces JOIN rag_domaines` (active non-wiki docs only). For each `rag_wiki_pages` row, parses its slug into the same components; if the tuple isn't in the live set, the page is orphaned → delete it. Wired into `index.ts` boot after `purgeLegacySentinelWikiPages` and before `bootstrapMissingPages`. Logs only when it actually deletes something.

---

## Chapter 5 — Graph: counter-scale + zoom max 8×

### Counter-scale every zoom-sensitive attribute

`applyNodeScale()` in Graph.tsx runs on every zoom event and counter-scales:
- node radii (core / glow — glow gets a 1.4× selection bump)
- node core outline stroke
- label font-size (per-tier base via `baseFontSizeFor`)
- label y-offset (keeps text anchored just below the visible node edge as the node shrinks)
- label halo stroke (BG_COLOR outline behind text for readability)
- edge stroke-width (per-edge base via `baseStrokeWidthFor`)

`applyStyles` (which fires on hover/select) also counter-scales edge stroke-width — without this, a hover/select would reset edges back to base width and undo the counter-scale at high zoom.

### Why

Without counter-scaling, the SVG group's transform scales everything up at high zoom → tiny nodes turn into huge blobs, labels into screen-filling lighthouses. With counter-scale, apparent on-screen size stays roughly constant as the user zooms in — the Obsidian-style behavior where zoom = spread, not magnify. Labels become readable in context, not because they were scaled with the canvas.

### Zoom extent + clipping

- `scaleExtent([0.3, 8])` (was [0.08, 4] originally, then [0.3, 4] mid-session). Lower bound keeps the full constellation visible; upper bound now safely 8× because counter-scale prevents the blob problem.
- SVG element: `overflow: 'visible'` + `shapeRendering: 'geometricPrecision'`. Eliminates the per-frame clip recalc that caused the "nodes flash at max zoom" symptom — container's `overflow: hidden` still handles the viewport clip cleanly.

---

## Chapter 6 — Graph: synthetic hierarchy edges

### What & why

Pre-session, the graph showed tag-overlap and wikilink edges between documents only. Wiki-tier nodes (domain/project/thread overview pages) had no edges and appeared disconnected from the documents they cover. Now: synthetic `relationship: 'hierarchy'` edges form the **structural skeleton** — Domain → Project, Project → Thread, Thread → source documents.

### Implementation (`src/main/graphQueries.ts`)

New `buildHierarchyEdges(nodes, wikiPrefix, scopedIds)` helper:

1. **Domain → Project** + **Project → Thread**: JS-side joins on `(namespace, domaine_id)` between wiki-tier nodes already in the scoped set. Fast, no extra SQL.
2. **Thread → source documents**: one SQL roundtrip against `rag_wiki_page_sources` joined to `rag_wiki_pages.tier='thread'`, resolving the thread wiki doc by `source_path = wikiPrefix + slug + '.md'`. Both endpoints constrained to the scoped set.

All synthetic edges carry `relationship: 'hierarchy'`, `strength: 0`, and a stable `hier:<src>:<tgt>` id. **Do NOT inflate degree** — the node-degree subquery reads from `rag_relationships` only (hierarchy edges aren't stored there).

### Renderer styling (`Graph.tsx`)

- **Width:** `baseStrokeWidthFor` returns `0.8` for hierarchy (thinner than wikilink's `1.6`), counter-scaled with zoom.
- **Stroke:** `#3d4452` (slightly cooler than tag-shared's `#3a4150` so semantic edges read on top).
- **Dash:** `stroke-dasharray="4 4"` (zoom-counter-scaled so dash spacing stays constant).
- **Opacity:** base `0.2` (vs 0.15–0.6 for semantic edges). Focused/incident edges still brighten +0.5 on hover/select.
- **Physics:** longer preferred distance (`140` vs `45`/`95`) and much weaker pull (`0.04` vs `0.32` / `0.12×strength`) so hierarchy forms a loose scaffolding without yanking source docs onto their parent wiki nodes.

---

## Chapter 7 — Graph: label visibility ladder

### Old rule (deprecated this session)

`degree > 3 AND r >= 8` for raw docs → always show label. Wiki-tier nodes always show.

### New rule (current)

Wiki-tier nodes always show (structural anchors). Raw documents follow a progressive zoom ladder — **no persistent path**:

```
k < 2.0          : no raw-doc labels
k >= 2.0, < 3.5  : raw docs with degree > 6 only (high-connectivity surface first)
k >= 3.5, < 5.0  : raw docs with degree > 3 only (mid-connectivity joins)
k >= 5.0         : every raw-doc label
```

Hover + selection override every gate (explicit user intent). Transitions are 150ms named (`'label-opacity'`) so they don't fight with each other or with the zoom handler.

Removed constants: `PERSISTENT_LABEL_MIN_RADIUS`, `HIGH_DEGREE_LABEL_THRESHOLD`, `WIKI_LABEL_ZOOM`, `RAW_LABEL_ZOOM`. New: `RAW_LABEL_ZOOM_TIER_{1,2,3}` + `RAW_LABEL_DEGREE_TIER_{1,2}` + `LABEL_FADE_MS`.

---

## Chapter 8 — Graph: misc polish

### Selection ring → halo bump (no more harsh white circle)

- `circle.ring` SVG element fully removed (enter selection, `applyStyles`, `applyNodeScale` — all three sites).
- `applyStyles` halo opacity now uses max-priority across hover/selected/neighbor/dimmed: selected = 1.6× persistent, hover = 1.9× transient flash, neighbor = 1.3×, dimmed = 0.35× (selection wins over dimmed even when user hovers elsewhere).
- `applyNodeScale` glow circle r gets a 1.4× bump for the selected node. Selection-change useEffect calls `applyNodeScale()` so the bump appears immediately, not on next wheel.

### Hover tooltip removed

Floating tooltip + 200ms delay + nodeTypeFor/nodeBreadcrumb helpers — all removed. The selected-node detail rail shows the same info on click; the tooltip added noise during rapid scanning.

### Divider chevrons centered

`top: 10` → `top: '50%'` + `transform: 'translateY(-50%)'` on both the Graph rail-spine chevron and the Ingest split-divider chevron. Now floats at eye-line regardless of panel height.

### Reset view button

New `IconHome` button in the Graph toolbar (left of Re-layout). On click, animates the zoom back via `d3.transition('reset-view').duration(400).call(zoom.transform, initialTransformRef.current)`. `initialTransformRef` is set when the initial fit-to-content lands (after the 850ms post-sim-warmup timer), so reset is deterministic across data refreshes.

### NodeDetailRail duplicate-key fix

`incident.map((c) => <button key={c.id} ...>)` → `incident.map((c, i) => <button key={`${c.id}-${i}`} ...>)`. `c.id` is the neighbor node id; nodes can have multiple edges to the same neighbor (wikilink + tag-shared, or any semantic edge alongside the new hierarchy edge). Index tiebreaker eliminates the React warning.

### Click-to-pan-center (no zoom change)

Multiple iterations through the session; landed on the simplest form:

```ts
.on('click', (event, d) => {
  event.stopPropagation()
  setSelectedNodeId(d.id)
  const svgEl = svgRef.current
  const container = containerRef.current
  if (!svgEl || !container) return
  const { width: w, height: h } = container.getBoundingClientRect()
  const k = d3.zoomTransform(svgEl).k
  const tx = w / 2 - k * (d.x ?? 0)
  const ty = h / 2 - k * (d.y ?? 0)
  d3.select(svgEl)
    .transition('node-center')
    .duration(200)
    .ease(d3.easeCubicOut)
    .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k))
})
```

`k` is preserved (no scale change), so no sim cooling and no `d.fx/d.fy` pinning needed. Click → pan to center at current zoom; user zooms further manually with scroll. `event.stopPropagation()` required so the click doesn't bubble to the svg-level deselect handler (line ~800).

**Aborted attempt (deferred to Session 5):** zoom-on-click with `targetK = max(currentK, 2.5)` mis-centered on the first click because the detail rail mounts mid-transition (steals ~306px width), and the dim-aware compensation patterns caused more issues than they solved. New gotcha entry covers this.

---

## Chapter 9 — Domain spelling + UI polish

### "Domaine" → "Domain" in UI labels only

Display strings swept across `Shell.tsx`, `Domaines.tsx` (modals, breadcrumbs, button titles, placeholders), `Wiki.tsx`, `Ingest.tsx`, `Search.tsx`, `Syntheses.tsx`, `Graph.tsx` (tooltip text + the `nodeTypeFor` chip), `DomaineBadge.tsx` (aria-label + title), `MaintenanceTab.tsx` (Nuclear Reset description list), `ConnectionsTab.tsx` (Reset tooltip). All identifiers, type names, store names, IPC channels, file names, comments, and `console.*` debug logs left alone per spec. Tests didn't reference any "Domaine" display strings, so left alone.

### Context menu portal fix (`Domaines.tsx`)

Three-dot kebab popover on project/thread cards was rendering ~300px below where it should have. Root cause: the card has `transform: translateY(-1px)` on hover, which (per CSS spec) makes the card the containing block for any `position: fixed` descendant — so the popover's viewport coords from `getBoundingClientRect()` were interpreted relative to the transformed card, not the viewport.

**Fix:** wrap the popover in `createPortal(<>...</>, document.body)` so it escapes the transform context entirely. Plus vertical-flip logic: if `rect.bottom + popoverHeight > window.innerHeight`, anchor above the trigger instead.

### Alphabetical sort helper

New `src/renderer/src/utils/sortByName.ts` — case + accent-insensitive sort via `localeCompare(..., { sensitivity: 'base' })`. Applied at two sites:

- **ThreadPickerHeader.tsx** — Scribe header accordion (projects + threads now A→Z)
- **Domaines.tsx** cross-Domaine move-thread picker (the "move this thread to another project" target dropdown)

Sites deliberately left alone (already user-controllable via SortMode): Sidebar.tsx file tree threads, Domaines tab project/thread grids. Domaines themselves keep their position-based order (drag-to-reorder from migration 004).

---

## Chapter 10 — Ingest tab fixes

### Header compaction — stats merged into filter row

Two stacked header bars (`SummaryRow` with large numbers + `Filter row`) collapsed into one. New `StatsChips` component renders compact muted inline chips on the left: `42 docs · 208 tags · 267 rel · 52m ago · ● Clean`. Filter controls stay on the right. Tooltips preserved (Documents hover still shows in-scope-vs-total when Domain filter narrows; Health hover shows orphan/dead-link breakdown; Last ingest hover shows raw ISO).

Deleted: `SummaryRow`, `SummaryStat`, `HealthBadge` (the old vertical-stack components with `fontSize: 16, fontWeight: 700` headline numbers).

### CodexPreview Lucide-style icons + visible chevron

Replaced unicode glyphs (`✎ ⇩ 🗑 ▾ ▴`) in CodexPreview's slim header with `Icons.tsx` SVG icons (`IconEdit`, `IconImport`, `IconTrash`). Made the expand/collapse chevron prominent: 32×28 button with `--bg-subtle` background, `--border-default` outline, `--text-primary` color, holding an 18px `IconChevronDown` / `IconChevronUp`. No more nearly-invisible text glyph.

Added `IconChevronUp` to `Icons.tsx` (single polyline `3,10 8,6 13,10`) matching the project's hand-rolled Lucide-style stroke set.

### Ingest preview citation sources fetch (sourcesLoaded:false bug)

Andy's diagnostic showed `[WikiNavDiag] citation click: {n: 1, hasNav: true, sourcesLoaded: false, sourcesCount: 0}` — citations in the Ingest preview didn't resolve. Root cause: the source-loading useEffect in `CodexPreview.tsx` early-returned on `mode !== 'wiki'`. Ingest opens wiki rows with mode like `'cross-thread'` (it classifies by file location, not content type), so `wikiGetSources` never fired.

**Fix:** the wiki-detection condition is now `mode === 'wiki' || doc.source_type === 'wiki' || !!doc.slug`. Any of those three signals triggers the fetch. Slug derivation falls back to stripping `_Codex/Wiki/` (or transitional `_Library/Wiki/`) and `.md` from `source_path`. For confirmed non-wiki docs, sets `wikiSources` to `[]` instead of `null` — sourcesLoaded reads `true` truthfully with `sourcesCount: 0`, click still bails at `!src` guard.

### Ingest preview link safety-net delegation

`MarkdownReader` in CodexPreview gained `handleDelegatedAnchorClick` on the wrapper div — catches any `<a>` click whose default wasn't already prevented by a per-branch handler. Routes through `onInternalLinkClick` for non-external, non-anchor, non-custom-protocol hrefs. Belt-and-suspenders for edge-case link syntax that might escape a specific `components.a` override.

---

## Chapter 11 — Misc

- **DomaineBadge.tsx** aria-label + title: "Domaine" → "Domain".
- **Doc updates:** `STATUS.md` (top-line + doc map + workspace-roots note), `gotcha.md` (two new entries added at session end — see below). `architecture-v4.md` left alone (legacy doc; references stay as historical record).
- **package.json:** unchanged this session (graphology + metrics + louvain added in Session 1 chapter above).
- **Bundle size:** renderer ~2,457 KB (Syntheses component + graph theme code + analytics store types). Main 234 KB (graphology + metrics + louvain stay in main, never ship to renderer).

---

## Verification at session end

```
npm run test                            → 6 files / 28 tests passed (~2.0s)
npm run db:setup                        → migrations 001 → 008 applied; 10 RAG tables present
npx tsc --noEmit -p tsconfig.web.json   → 6 pre-existing errors, 0 new
npx tsc --noEmit -p tsconfig.node.json  → 5 pre-existing errors, 0 new
```

---

## Open priors carried into Session 2 (Honcho fixes)

- **Click-to-zoom on graph nodes — deferred to v4 Session 5.** Multiple attempts this session to add a smooth zoom-to-node on click ran into the dynamic-container-width problem (detail rail mounts on selection, stealing ~306px, so the first click of a session mis-centers). See new gotcha entry. Current behavior is pan-only (200ms easeCubicOut at current zoom); revisit zoom-on-click with proper isolation in Session 5.
- **The 11 pre-existing tsc errors** stay deferred to v4 Session 8. The new code adds zero.
- **Constellation as default** — `graphTheme` defaults to `'constellation'`. Andy may want Cell — flip the default in `graphStore.ts` if so.
- **Community naming is heuristic.** "tagA + tagB" works on Andy's current corpus. Two clusters sharing the same top tag would be indistinguishable. Session 3's Synthesis Agent renaming via Sonnet fixes this.
- **Analytics IPC runs on every Graph refresh.** Brandes + Louvain at <500 nodes = <200ms. Cache keyed on `(domaineId, crossDomaine, ingestEventCount)` would avoid recompute on tab switches; not done yet.
- **`_Library/Wiki/` transitional fallbacks** in regex/SQL/substring sites — labeled with `// transitional v14→v15 fallback`. Safe to drop once we're confident no pre-rename paths exist anywhere. Natural fit for Session 8 code health.
- **iCloud / Telegram / Hermes** untouched — still v4 Session 5.
- **Honcho compression / Dreaming Agent / memory inspection** untouched — Session 2 starts here.
- **The Syntheses tab's "Write synthesis · S3" buttons** are stubbed (log gap_id). Real generation = Session 3 Synthesis Agent.
- **Heuristic rail-width = 306px** — the click-pan handler reads `getBoundingClientRect()` live, so this is moot for pan; was relevant for the abandoned click-zoom. If revived in Session 5, the proper fix is `railCollapsedRef` + `railWidthRef` mirrors so the click handler reads the current footprint (14px collapsed vs `railWidth + 6` expanded).
- **First-boot expectations** — after restarting `npm run dev`, look for these logs to confirm everything is healthy:
  - `[Boot] Workspace roots resynced → …` (only if `libraryPath` was healed from `/_Library` to `/_Codex`)
  - `[Boot] legacy sentinel purge: deleted N wiki pages, M rag_documents rows, K orphan tags` (only on first boot after the v14→v15 rename)
  - `[Boot] wiki slug reconciliation: deleted N rename-orphaned pages` (only if reconciliation found orphans)
  - `[Boot] wiki bootstrap: compiled=N skipped=M alreadyExists=K`
  - `[Boot] wiki zombie sweep: deleted=N doc rows, M orphan tags (unlinked K files)`

---

## Hand-off (v14 session, written before Session 2)

Read `STATUS.md` first (refreshed at session end), then `architecture-v4.md` Part 12 for Session 2. The MVP and v13 are intact; the v4 analytics + Syntheses foundation is live; the graph reads as a proper constellation with hierarchy skeleton; the `_Codex` rename + libraryPath give Andy iCloud-ready paths; renames now invalidate + rebootstrap wiki pages correctly. Next session = Honcho compression at 80% + Dreaming Agent + memory inspection panel.

🍣

---

# Session 2 — completion chapter (architecture-v4 Session 2 + UX consolidation)

**To:** the next Claude session
**From:** Session 2, 2026-05-13 → 2026-05-14 (continuation of v14). The session opened against architecture-v4 Session 2 (Honcho compression + Dreaming Agent + memory inspection panel) and grew across multiple iterations as Andy stress-tested the new surfaces: a context-bloat fix (62% → 3% after compression), a model-aware context-window fix (the bar was hardcoded to 8 K regardless of provider), Compress-button UX hardening, and a final UX consolidation pass that moved destructive actions out of the chat header into Settings → Maintenance.
**You are starting:** the MVP + v13 + v14 baseline is intact. Architecture-v4 Session 2 is complete and Andy has working Honcho compression, an Honcho Dreaming Agent that fires on branch / first-thread-load / manual button, a Memory inspection panel in the chat header, model-aware context measurement, and a clean A→B→C escalation in Settings → Maintenance for every destructive action. **Session 3 (Synthesis Agent) is the next planned chapter** — see `architecture-v4.md` Part 12.

---

## 🛑 READ FIRST — verification rules (unchanged this chapter)

`npx tsc --noEmit -p tsconfig.web.json` for renderer changes (the script `npm run typecheck`'s `&&` short-circuits on node-side pre-existing errors). Main-process changes need a full `npm run dev` restart; renderer changes hot-reload. `npm run test` = 28 vitest tests against the real test Postgres. **Still 28/28 at session end.** Zero new tsc errors introduced; the 11 pre-existing errors carried over from v14 are still tabled for Session 8 (line drift on `ipc.ts:304 → 466` is the same TS2345 `path.basename` map error, just shifted because of code added in Session 2; same root cause).

---

## Chapter 12 — Honcho compression at 80 % (Option B: prompt-then-reset)

### What landed

The 80 % context warning (which previously just suggested "+ New Thread") is now a three-button prompt:

> Context is at N %. Compress this conversation? **[Compress] [Later] [+ New Thread]**

- **Compress** runs the existing Reset-Context pipeline silently (no confirm dialog) — same as clicking the orange ⟲ Reset button manually. Server-side Honcho summary fetched first; falls back to a one-shot LLM summarization (~600 tokens, temp 0.2) if Honcho hasn't auto-summarized yet. Summary archived to `Memory_<Project>_<Thread>.json` with `trigger: 'reset'`, then a fresh Honcho session is bound.
- **Later** dismisses the prompt with a re-arm-on-drop-below-80 semantic (see "Threshold-crossing dedupe" below).
- **+ New Thread** is the v14 quick-branch flow, unchanged.

### Threshold-crossing dedupe

Replaced the v14 "dismiss-once-per-thread" pattern with a re-arm-on-crossing pattern. The user's [Later] click sets `contextWarningDismissed = true`. An effect (ChatPane lines around `contextPct < 80 && contextWarningDismissed`) flips it back to `false` whenever the bar drops back under 80. Result: if they keep chatting past 80 %, no nag; if the bar drops (after a compress or thread switch) and crosses 80 again, the prompt fires once more. Per-thread reset on `config.activeThreadPath` change.

### Honest context % calculation (initial form — see Chapter 16 for the bar-measurement upgrade)

The bar previously counted only `chatHistory` (`content.length / 4`). It now includes:

```
totalChars = chatChars + activeFileChars + commentsChars + summariesChars + systemScaffoldChars
```

`systemScaffoldChars = 800 + agent.systemPrompt.length`. Char-based, 4 chars/token. **Honest, directional**, not a tokenizer — different providers tokenize differently and we don't try to match.

### Auto-compress code path

`runResetContext()` was extracted from the old `handleResetContext` so both the manual button and the auto-prompt share the same pipeline. The auto-path passes `silent: true` to skip the `window.confirm()`.

---

## Chapter 13 — Honcho Dreaming Agent (`honchoDream()`)

### Endpoint + main-process implementation

`POST /v3/workspaces/holocron/peers/andy/chat` — Honcho v3's dialectic chat endpoint. Body: `{ queries: [string], stream: false, session_id }`. Returns `{ content: string }`. **Degrades silently** when the deployment doesn't expose the endpoint (404 / 405 / any non-2xx) — logs `[Honcho/Dream] ← N (degrading)` and returns `{ ok: false, error }`. **Chat flow is never broken** by a missing endpoint.

Implementation lives in `src/main/honcho.ts`:

```ts
export async function honchoDream(
  baseUrl: string,
  peerId: string,
  sessionId: string,
  context: DreamContext,  // { threadName, projectName, domaineName }
): Promise<{ ok: true; insight: string } | { ok: false; error: string }>
```

The query is composed from the thread context: "Domain X · Project Y · Current thread Z. Synthesize patterns across my prior sessions … 3-6 sentences, no preamble."

### Persistence — `dreamInsights[]` per DATA_MODEL §2.6

`appendDreamInsight()` in `projectFs.ts` writes to the Memory file's `dreamInsights[]` array. Each entry: `{ queriedAt, trigger, insight }`. Also updates `thread.json.lastDreamQuery` (best-effort, non-fatal). The `MemoryFile.dreamInsights` field has always existed in the type — Session 2 is the first session that actually writes to it.

### Firing triggers — three of them

1. **On branch creation** — `thread:branch` IPC handler calls `honchoDream(baseUrl, 'andy', predSessionId, { …predecessor context… })`. Replaces the v14 hard-coded `dreamInsight: null`. The insight flows into `BranchInheritance.dreamInsight` and is rendered into the new thread's `inheritedContext` via `formatInheritanceForPrompt`. Also archived to the new thread's Memory file by `branchThread()` itself.
2. **First thread load of an app launch** — `dreamOnce()` in `threadActions.ts` is called from `loadThread()` after the Honcho bind succeeds. A module-level `Set<string>` keyed on `<threadPath>::<threadName>` dedupes — switching threads during a session does NOT re-query (it's not a free call). The Set clears on full app restart.
3. **Manual "Dream now" button** in the Memory panel — passes `{ force: true }` to skip the dedupe.

### Failure modes (all silent + safe)

- Empty `content` from Honcho → `{ ok: false, error: 'empty content' }`. Memory panel shows "No insight available (Honcho may not have enough history yet)."
- 404 (endpoint not deployed) → degrades + logs.
- Network blip / non-2xx → degrades + logs.
- Any insight written via the IPC append handler — failure to write is non-fatal (caught + logged).

### Where dreams surface in the agent's prompt

- On a freshly-branched thread: `inheritedContext` includes `"Key Insights from Dreaming Agent: <insight>"` (`formatInheritanceForPrompt` in `projectFs.ts`).
- On other threads: the dream insight lives in `dreamInsights[]` and the Memory panel. **Not** auto-loaded into the system prompt every turn — agents can reference the Memory file by path if needed (see Chapter 15: "Context bloat fix").

---

## Chapter 14 — Memory inspection panel (final form after consolidation pass)

The panel went through three iterations this session. The final shape (after Chapter 19's UX consolidation) is what ships:

### Toggle

Cyan `Memory ▸ / ▾` button in the chat header (next to the orange ⟲ Reset). Opens a 360-px-max-height collapsible drawer under the header. Tied to the active thread; hidden in sandbox / when Honcho disabled.

### Contents (final, after consolidation)

- **Session** — last 8 chars of session id (`…abc12345`); full id on hover via `title`.
- **Duration** — live (refreshes every 60 s) since `thread.json.createdAt`; exchange count derived from `chatHistory.length / 2`.
- **Last reset** — timestamp + total compression count.
- **Dream insights** — collapsible list, newest first; `[trigger]` + timestamp header per entry. Always-visible "Dream now" button top-right (manual trigger, `force: true`).
- **Memory file** — section with:
  - Compact path (`~/…/last/three/segments`); click toggles full path; hover shows full path via `title`.
  - Summary count on disk.
  - **Latest summary preview** — first 200 chars; "expand" / "collapse" link reveals full text.
  - **`READY FOR SYNTHESIS ✦`** teal pill — only renders when `memoryFile.synthesisReady === true` (see Chapter 17).
- **Footer link** — muted underlined "Nuclear resets → Settings → Maintenance" navigates via `openSettingsAt('maintenance')`.

### What was REMOVED from the panel in the consolidation pass

- "Clear Honcho session" button → moved to Settings → Maintenance §A.
- "Clear ALL Honcho sessions" button → moved to Settings → Maintenance §B.

The panel is now strictly **inspection + the one lightweight productive action (Dream now)**. Everything destructive lives in Maintenance behind typed-confirmation gates.

---

## Chapter 15 — Context bloat fix (62 % → 3 % after compression)

### The symptom

After a successful Reset Context, the bar would land at ~62 % instead of the expected ~15-20 %. The compression itself succeeded — the Honcho session rotated, Memory file was updated — but the chat felt no different.

### Root cause

`useLMStream.ts:buildSystemMessage()` was eagerly stamping ALL 5 most-recent summaries into the system prompt as `--- Previous Session Memories ---\n[Memory 1] …\n[Memory 2] …` etc. With each summary being 1-2K chars, the block alone consumed ~5-10K chars — i.e. ~40 % of an 8K context window — **before the user typed anything**. The summaries themselves were defeating the compression they came from.

### The fix

Three call sites changed in lockstep:

1. **`buildSystemMessage` (`useLMStream.ts`)** — the multi-summary `--- Previous Session Memories ---` block is replaced with:
   - One-line memory-file-exists reference + the **absolute path** to `Memory_<Project>_<Thread>.json` so the agent can cite it on demand.
   - At most ONE brief orienting paragraph (the most-recent summary, paragraph-capped at ~400 chars by `trimSummaryForPrompt()`).
2. **`loadThread()` (`threadActions.ts`)** — populator changed from `slice(-5).map(verbose-format)` to `[trimSummaryForPrompt(summaries[last].summary)]`. Also populates new scribeStore fields: `memoryFilePath` + `memoryHasSummaries`.
3. **`runResetContext()` (`ChatPane.tsx`)** — same single-brief load after a reset (was also doing the full `slice(-5)`).

### New helpers

- **`trimSummaryForPrompt(raw)`** in `threadActions.ts` — paragraph-cap with sentence-boundary truncation; strips the `[trigger YYYY-MM-DD]` header prefix from the old format. Cap = 400 chars; falls back to a sentence boundary near the cap if one exists, otherwise `[…cut] …`.
- **`memoryFilePathFor(threadPath, projectName, threadName)`** in `projectFs.ts` — single source of truth for the Memory file's resolved absolute path. Honours `System/`-vs-legacy layout discriminator. Used by the IPC handler so the renderer doesn't have to duplicate the resolution.

### IPC change

`thread:read-memory-file` now returns `{ ok, memoryFile, filePath }` — `filePath` is always present (even when the file doesn't exist yet) so the renderer can surface it.

### New scribeStore fields

- `memoryFilePath: string` — `''` when no thread active. Surfaced in the system prompt.
- `memoryHasSummaries: boolean` — drives the chat-bar label that replaces "N summaries from Honcho".

### Chat-bar label change

Pre-fix: `· N summaries from Honcho` (cyan). Post-fix:
- `· Fresh session — prior context in Memory file` (when one brief just landed)
- `· Prior context in Memory file (on disk only)` (when summaries exist on disk but none in active context)

Honest copy: tells Andy exactly what's where.

---

## Chapter 16 — Model-aware context window (the 8 K hardcode)

### The symptom

After Chapter 15's bloat fix, Andy reported the bar **still** read 90 %+ just from opening a doc. Not a regression — a different bug surfaced once compression actually worked.

### Root cause

`ChatPane.tsx` had `const contextWindow = ai.contextWindow` — hardcoded to whatever LM Studio's window was (default 8,192). The bar always divided by 8,192 even when Andy was using Gemini Flash (1 M tokens) or Claude Sonnet (200 K). A 60 K-char document → 15 K tokens → 92 % on a Flash session that was actually 1.5 % utilised.

### The fix

`activeProvider`-aware routing. The per-provider context windows already existed in the config (`gemini.contextWindow = 1_048_576`, `anthropic.contextWindow = 200_000`, `ai.contextWindow = 8_192`) — the bug was purely that ChatPane never consulted `activeProvider`:

```ts
const contextWindow =
  activeProvider === 'gemini'    ? (gemini.contextWindow    || 1_048_576) :
  activeProvider === 'anthropic' ? (anthropic.contextWindow || 200_000) :
                                   (ai.contextWindow         || 8_192)
```

Routes through the existing config fields so Andy can override any of them in Settings → Connections (relevant if he ever uses Opus 4.7's 1 M tier or a long-context LM Studio model).

### Downstream effects (automatic)

- `contextPct = (tokenEstimate / contextWindow) * 100` — recomputes against the correct window. ✓
- The 80 % auto-compress check (`contextPct >= 80`) uses the percentage, not the absolute. On Gemini Flash the prompt only fires at ≥ 800,000 tokens — essentially never in normal use. ✓
- Bar label format unchanged (`~{n} / {W} tokens (X%)`) but the numerator/denominator now read honestly per provider.

### Active file content load — INTENTIONALLY left alone

Line 142 of `useLMStream.ts` (`...currently has the following document open:\n\n${fileContent}...`) is **unchanged**. Now that cloud-model windows are 25× (Claude) to 128× (Gemini) bigger than the old static 8 K, the full-doc-in-prompt pattern is no longer a saturation risk. If Andy uses a small-window LM Studio model and the bar genuinely hits 80 % from a doc, the Compress button still rotates the session (and now shows a visible toast — see Chapter 18); the bar staying high is honest (the file IS the load).

---

## Chapter 17 — `synthesisReady` flag (Hive plumbing for Session 3)

### What the field is

`MemoryFile.synthesisReady?: boolean` — sticky-true once `summaries.length >= 3 || dreamInsights.length >= 3`. Optional in the type for backwards-compat (older Memory files written without it read as `undefined` → treated as `false`).

### Where it flips

`appendMemorySummary()` and `appendDreamInsight()` (both in `projectFs.ts`) each run `computeSynthesisReady(doc)` after the array push and set `doc.synthesisReady = doc.synthesisReady || computeSynthesisReady(doc)`. **Sticky** — once true, never falls back.

```ts
function computeSynthesisReady(doc: { summaries: unknown[]; dreamInsights: unknown[] }): boolean {
  return (doc.summaries?.length ?? 0) >= 3 || (doc.dreamInsights?.length ?? 0) >= 3
}
```

### Where it surfaces today

- The `thread:read-memory-file` IPC response carries `memoryFile.synthesisReady` through to the renderer.
- The Memory panel renders a teal `READY FOR SYNTHESIS ✦` pill when true.

### What it's for (Session 3)

Session 3's Hive will read this flag to decorate threads with a "ready to admit to Codex" badge. The Memory panel pill is a preview of that affordance, scoped to the current thread. **No further work on the Hive side this session** — the plumbing is in place, the consumer comes in Session 3.

---

## Chapter 18 — Compress-button UX hardening

Two small fixes to close the loop on a UX rough edge that surfaced once Andy actually used the 80 % prompt:

### Fix 1 — Dismiss-on-success (was: don't dismiss)

`handleAutoCompress` post-success now sets `contextWarningDismissed = true` (was `false`). The re-arm-on-drop-below-80 effect handles the next crossing automatically. **Why this matters**: on cloud models when the active doc is the dominant load (e.g. a 200K-char doc on a Sonnet session), Compress rotates the Honcho session but the bar stays at 93 % because the file content is unchanged. The pre-fix `false` immediately re-rendered the prompt — Andy would click Compress, see the prompt re-appear, conclude "button doesn't work". The `true` flip means he sees the toast (below) and the prompt stays dismissed until the bar drops below 80 and crosses again.

### Fix 2 — Visible toast

After a successful auto-compress: `"Compressed at HH:MM — Honcho session rotated, prior turns archived to Memory file."` Orange-tinted 11 px in-chat note, 5-second timeout. Mirrors the pattern that briefly existed for the (now-removed) "Reset conversation" button.

### State

```ts
const [compressNote, setCompressNote] = useState<string | null>(null)
```

Rendered inside the chat scroll area between the messages list and `listEndRef`, so it scrolls into view with the latest content.

---

## Chapter 19 — UX consolidation (the final pass)

### Motivation

Mid-session, the chat header had **three** buttons (Memory, ⟲ Reset, "Reset conversation") and the Memory panel had **two destructive buttons** (Clear-session, Clear-ALL) inside a small drawer with typed-confirmation gates. Andy's words: "the memory controls are scattered and confusing." A consolidation pass moved everything to two places only:

### Chat header — 2 controls

- `⟲ Reset` (orange) — the persistent hard-reset. Unchanged.
- `Memory ▸ / ▾` (cyan) — opens the inspection panel. Unchanged.

The middle "Reset conversation" button (and its `handleClear` / `resetNote` state) was **deleted entirely**. Its honest-copy note ("Honcho memory retained …") was useful copy but the button itself muddied the choice space next to the persistent ⟲ Reset, which already does the right thing.

### Memory panel — strictly inspection + Dream

Removed Clear-session and Clear-ALL buttons + their typed-confirmation gates. Added the Memory File section (compact path, summary count, latest-summary preview, synthesisReady badge) and a footer deep-link to Maintenance.

### Settings → Maintenance — escalating A→B→C triad

| Letter | Action | Border / Color | Confirmation gate | What it does |
|---|---|---|---|---|
| **A** | Clear thread memory | amber (`--accent-orange`) | type the active thread name | `threadClearHonchoSession`: server DELETE (best-effort) + always rotate session locally + re-bind active session + clear chatHistory. Memory file preserved. |
| **B** | Clear all thread memory | pink (`#ff2d78`) | type `CLEAR ALL` | `honchoClearAllSessions`: walks every thread, server DELETE per thread (best-effort), always rotates locally. Re-binds the current thread's new session. Memory files preserved. |
| **C** | Nuclear Reset | red 2 px border + drop-shadow | type `RESET` | `maintenanceNuclearReset`: wipes DB index + every folder under `projectsRoot`. **Existing behaviour, restyled most-prominent.** |

Clarified C's copy: "Source files in `_Codex/` outside `_Domaines/` are not removed by this action."

### Deep-link plumbing (Memory panel → Maintenance)

New in `settingsStore`:
- `settingsInitialTab: SettingsTabId | null`
- `openSettingsAt(tab)` — sets `settingsOpen = true` + initial tab
- `clearSettingsInitialTab()`

`SettingsModal` consumes via an effect: when `settingsOpen && settingsInitialTab` is non-null, set local `activeTab`, then clear the field. Subsequent re-opens fall back to the user's last-used tab (held in local state), so the deep-link doesn't permanently overwrite their preference.

The Memory panel's footer link: `<button onClick={() => openSettingsAt('maintenance')}>Nuclear resets → Settings → Maintenance</button>`.

---

## Verification at Session 2 end

```
npm run test                            → 6 files / 28 tests passed (~2.14 s)
npx tsc --noEmit -p tsconfig.web.json   → 6 pre-existing errors, 0 new
npx tsc --noEmit -p tsconfig.node.json  → 6 pre-existing errors, 0 new (ipc.ts:304 → 466 is line drift only)
```

No new tsc errors introduced across any deliverable. The 11 pre-existing errors are still tabled for Session 8.

---

## Files touched in Session 2 (cumulative across all chapters)

### Main process

- `src/main/honcho.ts` — `honchoDream()`, `deleteSession()`, `DreamContext` type.
- `src/main/projectFs.ts` — `MemoryFile.synthesisReady?: boolean`; `computeSynthesisReady()` helper; `appendMemorySummary` + `appendDreamInsight` flip the sticky flag; new `readFullMemoryFile()`, `appendDreamInsight()`, `memoryFilePathFor()` exports.
- `src/main/ipc.ts` — new handlers: `honcho:dream`, `honcho:delete-session`, `honcho:clear-all-sessions`, `thread:clear-honcho-session`, `thread:append-dream-insight`, `thread:read-memory-file`. `thread:branch` calls `honchoDream` to populate `inheritance.dreamInsight` (was hardcoded `null`).

### Preload + types

- `src/preload/index.ts` — exposed `honchoDream`, `honchoDeleteSession`, `threadClearHonchoSession`, `threadAppendDreamInsight`, `threadReadMemoryFile`, `honchoClearAllSessions`.
- `src/renderer/src/types/ipc.ts` — matching type signatures including `memoryFile.synthesisReady?: boolean` and `filePath: string` in the read-memory-file response.

### Renderer

- `src/renderer/src/store/scribeStore.ts` — `memoryFilePath` + `memoryHasSummaries` fields + setters.
- `src/renderer/src/store/settingsStore.ts` — `SettingsTabId` type, `settingsInitialTab` state, `openSettingsAt` + `clearSettingsInitialTab` actions.
- `src/renderer/src/utils/threadActions.ts` — `trimSummaryForPrompt()` helper; `dreamOnce()` helper with module-level Set for once-per-launch dedupe; `loadThread` rewritten to load 1 brief + Memory file path.
- `src/renderer/src/components/chat/useLMStream.ts` — `buildSystemMessage` accepts `MemoryReference` (path + has-summaries); multi-summary block replaced with single brief + path reference.
- `src/renderer/src/components/chat/ChatPane.tsx` — auto-compress prompt + threshold dedupe; model-aware `contextWindow`; Compress toast + dismiss-on-success; Memory button toggling the panel; **removed**: "Reset conversation" button + `handleClear` + `resetNote`.
- `src/renderer/src/components/chat/MemoryPanel.tsx` (new in Session 2; rewritten in consolidation) — final form: inspection + Dream-now + Memory file section + Maintenance deep-link.
- `src/renderer/src/components/settings/SettingsModal.tsx` — consumes `settingsInitialTab` via effect.
- `src/renderer/src/components/settings/MaintenanceTab.tsx` — added "Memory & Data Resets" header + sections A and B + restyled C (Nuclear Reset) with thicker red border + drop-shadow.

---

## What Session 2 did NOT touch (per scope)

- `Honcho` deployment / API server — only the client side (`honcho.ts`) and the IPC surface.
- The active-file-content load in `buildSystemMessage` (line 142). Now safe at cloud-model window sizes.
- Graph / Syntheses / Wiki / Codex sub-tabs.
- `themes.ts` and Fey design work.
- Migration files (no new tables needed — `dreamInsights[]` and `lastDreamQuery` were already in the types).
- The 11 pre-existing tsc errors (Session 8 territory).
- `tsconfig.web.tsbuildinfo` (perpetually-dirty autogen).

---

## Open priors carried into Session 3

- **Synthesis Agent (architecture-v4 Session 3)** — next planned chapter. The "Write synthesis · S3" buttons in the Syntheses tab are still stubbed; the `synthesisReady` flag is now wired to surface threads that have accumulated enough material. Session 3's job: write the bridge-document generator (Sonnet) + the Hive UI that consumes `synthesisReady` thread-wide.
- **`auto-80` trigger label** — the IPC log line shows `trigger: 'auto-80'` for auto-compresses but the on-disk `MemorySummary.trigger` field uses the existing union `'reset' | 'branch' | 'compression'` (auto-80 archives as `'reset'`). Audit trail is preserved in console; the on-disk schema is unchanged. Extend the union if we ever want this distinction durable.
- **`memoryFile` IPC payload size** — `threadReadMemoryFile` returns the entire Memory file (summaries + dreamInsights). Currently fine (memory files are small); could grow problematic if a single thread accumulates hundreds of summaries. If it does, paginate or add a `?summary=preview` query parameter.
- **Honcho `/chat` endpoint availability is deployment-specific** — `honchoDream` degrades silently when the endpoint 404s. If your Honcho is older or doesn't have the dialectic chat endpoint, dream insights will just never populate. The Memory panel's "No insights yet" copy and the "Dream now" button's "No insight available" message communicate this honestly.
- **DELETE session unsupported** — similar story. `deleteSession()` returns `{ supported: false }` when the deployment doesn't expose DELETE on `/v3/.../sessions/{id}`. The Maintenance A and B paths fall back to "rotate locally, abandon old session" semantics. Andy will see "Honcho deployment doesn't support DELETE; old session abandoned, new session started." in the success message.
- **First-boot expectations (Session 2 additions)** — after restart, look for:
  - `[Honcho] addMessage OK` / `[Honcho/Dream] ← 200 insight (N chars)` / `[Honcho/Dream] ← 404 … (degrading)` — confirm Honcho client is healthy.
  - `[Thread] Loaded 1 brief summary (Nc) — M older summaries remain on disk only` — confirm the Chapter 15 fix is in effect.
  - `[ChatDiag] memory-load summaries-on-disk=N loaded-into-context=1 briefChars=N` — the diagnostic line you can use to verify context-prompt sizing.
  - `[ChatPane] reset → 1 brief summary loaded (Nc), M older on disk only` — confirms `runResetContext` is doing the single-brief load.
  - `[Dream] thread_load insight stored for <thread> (N chars)` — confirms first-load dream fired.

---

## Hand-off (Session 2 final)

1. **Read `STATUS.md` first** (refreshed at Session 2 end), then `architecture-v4.md` Part 12 for Session 3 (Synthesis Agent).
2. **`gotcha.md` has two new Session 2 priors at the bottom** — read those before debugging anything in the chat / memory area.
3. **Honcho memory is now complete per architecture-v4 Session 2**: compression at 80 % works, the Dreaming Agent fires on three triggers, the Memory panel inspects, model-aware context measurement is honest, and destructive actions all live in Settings → Maintenance behind typed-confirmation gates.
4. **Don't add more controls to the chat header** — the two-button pattern is deliberate. New memory-related controls go in the Memory panel (inspection) or Settings → Maintenance (destructive). See the new gotcha entry.
5. **Renderer hot-reloads everything in Session 2 except the IPC changes in `honcho.ts` / `projectFs.ts` / `ipc.ts` / `preload/index.ts`** — those need a full `npm run dev` restart + Cmd+Shift+R.

🍣
