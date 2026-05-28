# Handoff v18 — Architecture-v4 Session 6 (Graph visual overhaul + Move-document warmup)

**To:** the next Claude session
**From:** Session 6, 2026-05-14. Four parts shipped in one session — one warmup that codifies a manual workflow into one atomic operation, and three renderer-only refinements that consume Session 1's analytics to make the graph read as a structured information surface rather than just a pretty animation.

  - **Part A** — Move-document warmup: new "Move to thread…" item in the Scribe sidebar context menu (file branch). Click → modal with autofocused search + flat alphabetical list of every thread across every Domaine/Project (breadcrumb per row). Confirm → atomic `fs.rename` (with EXDEV → copy+unlink fallback) into `<destThread>/References/<basename>` (auto-mkdir `References/`, collision avoidance via ` (2)`, ` (3)`, …). Intentionally bypasses `withRenameLock` so chokidar's root watcher fires `unlink(old) + add(new)` and ragIngest does the SQL reconciliation through the normal pipeline — same cost as the prior manual workaround (Gemini tag re-extraction), now one click. Open file is closed in `scribeStore` on success; toast "Moved to [thread name]" at bottom-center for 3 s; sidebar refresh fires.
  - **Part B** — Selected-node spotlight: aggressive isolation when a node is **selected** (click, not hover). Selected/focused at 1.0 opacity, direct neighbors at 0.8, everything else at 0.15 (core + text), non-incident edges at 0.05, halo dim at 0.12× (was 0.35×). Hover-only path keeps the legacy 0.4 / 0.22 / 0.35 values so rapid mouseover scanning doesn't feel jarring. New `aggressive = !!sel` gate inside `applyStyles`; the existing `dimmed` variable is split into `focusDimmed` + `searchMiss` so the search overlay clamps to a `aggressive ? 0.15 : 0.3` floor independent of focus state.
  - **Part C** — Structural-gap dashed lines: faint dashed lines between Louvain-cluster centroids surface the "these two clusters should talk" insight on the graph itself, not just in the Syntheses panel. New `<g class="graph-gap-lines">` group inserted **behind** edges + nodes. `graphAnalytics` request bumped from `topGaps: 0` → `10`. Centroids recomputed each tick from `perNodeAnalytics.community` membership over current node positions (cheap: one pass over ~500 nodes, ~5 communities, ~10 gap lines). Lines styled `stroke: var(--text-dim)`, `stroke-opacity: 0.15`, `stroke-dasharray: 8 4` (counter-scaled by `1/k` in both `applyNodeScale` and the gap-bind effect so dashes stay pixel-constant). Only rendered in Constellation theme. Gap-bind effect re-runs on `[structuralGaps, useConstellation, graphData]` and nudges `sim.alpha` to 0.05 on rebind so positions land immediately instead of waiting for the perpetual-drift tick.
  - **Part D** — BC-driven brightness mapping: in Constellation theme for raw nodes, the core color's HSL `lightness = 0.4 + nBC × 0.6` (range [0.4, 1.0] = dark → near-white at peak BC) and `saturation = 0.65 − nBC × 0.35` (range [0.65, 0.30] = satellites saturated, influencers faded). Brightness now reads as influence: the highest-BC bridges glow near-white, low-BC satellites stay saturated color at a darker lightness. Wiki-tier nodes keep their existing tier-specific `coreColorFor` treatment (always-bright structural anchors; BC is meaningless for them since wiki edges aren't in `rag_relationships`).

**You are starting:** the MVP + v13 + v14 + Session 2 + Session 3 + Session 4 + Session 5 + Session 6 baseline is intact. **Architecture-v4 Session 6 is complete.** The Graph tab is now visually load-bearing — color encodes community, size encodes betweenness, brightness encodes influence, gap lines surface analytical insights, and the selected-node spotlight makes the local subgraph inspectable. Andy can also right-click any document in the Scribe sidebar and move it into any thread's `References/` folder in one click. **Session 7 (Working Memory panel + UI polish — auto-delete Inbox after Foundry admission, Domaines navigation state persistence, multi-select Domain filter on the graph, the Working Memory model replacing the token counter)** is next.

---

## 🛑 READ FIRST — verification rules (unchanged)

`npx tsc --noEmit -p tsconfig.web.json` for renderer changes. `npm run typecheck`'s `&&` still short-circuits on the node-side pre-existing errors; check the renderer alone with the explicit per-project invocation. Main-process changes need a full `npm run dev` cycle; renderer hot-reloads. `npm run test` = 28 vitest tests against the real test Postgres. **Still 28/28 at session end.** Zero new tsc errors introduced; no pre-existing errors fixed (Session 8 still owns the triage pass).

### Pre-existing tsc errors after Session 6

Node-side: **4 errors** (unchanged from end of Session 5):

| File | Line(s) | Code | Note |
|---|---|---|---|
| `src/main/cleanupOps.ts` | 517 | TS2322 | `withRagClient` returns `number\|null` |
| `src/main/dashboard.ts` | 54 | TS18047 | `res.rowCount` nullable |
| `src/main/ipc.ts` | 527 | TS2345 | `path.basename` in `.map(...)` — drifted again with the two Session 6 IPC handlers; same root cause |
| `src/main/ragIngest.ts` | 234 | TS2339 | `config.gemini` not on `HolocronConfig` — also hits `foundry.ts:480`, `hermes.ts`, `ipc.ts:1478` via the same workaround pattern |

Web-side: **6 errors** (unchanged):

| File | Line(s) | Code | Note |
|---|---|---|---|
| `src/renderer/src/components/chat/ChatMessage.tsx` | 67 | TS2353 + TS7031 | react-markdown component override |
| `src/renderer/src/components/codex/CodexPreview.tsx` | 1419, 1518 | TS2345 + TS2352 | ScribeColorTheme + ReactPortal |
| `src/renderer/src/components/hud/HUD.tsx` | 50 | TS2367 | `'dashboard'` literal vs `AppTab` |
| `src/renderer/src/components/scribe/selectionObserver.ts` | 14 | TS2344 | PluginValue |

Total **10 errors remaining** (unchanged from end of Session 5). Filter typecheck output for files YOU touch. Don't fix the above unless explicitly tasked — Session 8 in `architecture-v4.md` §12 is the dedicated triage pass.

---

## Read order (~20 min)

1. **`docs/STATUS.md`** — refreshed at Session 6 end (points at Session 7 next).
2. **This file** (HANDOFF_v18) — the Session 6 chapter.
3. **`docs/architecture-v4.md`** §9 + §11 — Session 7 (Working Memory panel + UI polish). Part 11.2 lists the small UI improvements queued from earlier sessions; Part 9 is the Working Memory spec.
4. **`docs/gotcha.md`** — Session 6 priors block at the bottom has four new entries (move-to-thread mechanics, gap lines in Constellation only, BC-brightness wiki-exemption, multi-select Domain filter is Session 7 territory). Don't add more single-select filters — build the multi-select properly.
5. **`docs/HANDOFF_v17.md`** Session 5 chapter — context for the Hermes/iCloud/Foundry surfaces that Session 7 will lightly touch (auto-delete Inbox after admission is a small Foundry-side polish, not a redesign).

---

## Decisions locked at session start (do not relitigate)

- **Move-to-thread bypasses `withRenameLock`.** This is the **opposite** of how `renameThread` / `moveThread` work for thread folders. The reason: we WANT chokidar's root watcher to fire `unlink(old) + add(new)` so ragIngest soft-deletes the old row and ingests the new one through the normal pipeline. The alternative (lock + explicit SQL UPDATE on `rag_documents.source_path`) would be more atomic but would re-implement half of the ingest pipeline for one feature. Cost of the chosen path: Gemini tag re-extraction at the new path (~$0.0002 per move on Flash). Same cost as the prior manual workaround. See `projectFs.ts:moveDocumentToThread` docstring for the in-code articulation.
- **Aggressive spotlight only fires on click-select, not hover.** Hover-only keeps the gentler `0.4 / 0.22 / 0.35` values so rapid mouseover scanning doesn't feel like the graph is going dark and re-lighting. The aggressive `0.15 / 0.05 / 0.12` values are reserved for click-locked inspection. Same `aggressive = !!sel` gate is reused for the search-mismatch overlay so it stays consistent.
- **Gap lines are Constellation-only.** Cell theme is Domaine-colored / degree-sized — gap analytics (Louvain communities) is meaningless in that visual frame. The gap-bind effect's `visible = useConstellation ? structuralGaps : []` is the gate; switching themes empties the line bind cleanly.
- **`topGaps: 10` is the new default.** Not configurable yet. Surfacing the top 10 covers the common case without crowding the canvas. If Andy ever wants a higher count he can raise it manually; a Settings → Connections knob isn't worth it for a single-user tool.
- **BC-brightness applies to raw nodes only.** Wiki-tier nodes (domaine/project/thread anchors) keep their `coreColorFor` tier-specific brightening. Their BC is structurally zero in `rag_relationships` (wiki edges aren't in the table), so a BC-driven brightness would make them all dim — defeating their role as always-readable anchors. The check is `cls === 'raw'` in the graphData memo.
- **Zoom-behavior ladder is NOT inverted.** Andy asked to verify, not fix. Current `labelOpacityFor`: `k < 2.0` → no raw-doc labels, `k ≥ 5.0` → all. Since k INCREASES as the user zooms IN, this is "zoomed out = wiki anchors only (structure) / zoomed in = progressively more detail" — direction is correct, not inverted. The one refinement worth flagging (low priority, see known-limits §1) is that the gate uses `degree` rather than BC, so in Constellation theme the big high-BC bridge nodes are unlabeled at low zoom. Cosmetic, deferred.

---

## Chapter 1 — Part A: Move document to thread

### 1.1 The user-facing surface

Right-click a `.md` (or other) file in the Scribe sidebar's file tree → **"Move to thread…"** appears below "Rename" in the file-branch context menu (between "Rename" and the `<CMDiv />` separator that precedes "Re-ingest"). Click → modal opens centered, autofocused on the search input.

Modal contents:
- Header with the source filename + `→ <thread>/References/`
- Search input (filters by `domaineName projectName threadName` lowercased — type any segment)
- Scrollable list of every thread across every Domaine + Project (active thread excluded), each row showing the thread name large + the `Domaine › Project` breadcrumb small
- Footer with `X of Y threads` count + Cancel button

Click any row → IPC fires, modal closes, file disappears from the sidebar (chokidar `unlink`), toast "Moved to *threadName*" appears at bottom-center for 3 s, sidebar refresh event fires so the tree re-fetches.

Keybindings: **Escape** dismisses the modal. **Backdrop click** dismisses. **Cancel button** dismisses.

### 1.2 `listAllThreadsFlat(projectsRoot, excludeThreadPath)`

New in `src/main/projectFs.ts` (just after `moveThread`). Walks the three-level Domaine/Project/Thread tree with `listSubdirs`:

```
for each domaine subdir under projectsRoot:
  for each project subdir under <domaine>:
    for each thread subdir under <project>:
      if thread.path !== excludeThreadPath: push { threadPath, threadName, projectName, domaineName }
```

Returns sorted alphabetically by the three-component breadcrumb (`localeCompare` on each segment, in order). `excludeThreadPath` is the active thread — passed by the IPC handler from `cfg.activeThreadPath` so the picker never offers a no-op destination. Empty string passes everything through.

No DB hits — this is purely a filesystem walk. Same `listSubdirs` helper that `listProjects` / `listThreads` already use, so it inherits their `.startsWith('.')` skip + their mtime read.

### 1.3 `moveDocumentToThread(srcPath, destThreadPath)`

New in `src/main/projectFs.ts` (immediately after `listAllThreadsFlat`). Flow:

1. Validate: src exists + is a file, dest exists + is a directory, src is NOT already under destThreadPath (no-op refuse).
2. `mkdir -p` the destination's `References/` folder.
3. Collision avoidance loop: try `<basename>`, then `${stem} (2)${ext}`, ..., up to `${stem} (999)${ext}`. First name that `fs.stat` returns ENOENT for wins.
4. `fs.rename(srcPath, candidate)`. On `EXDEV` (cross-device move — rare inside an iCloud-synced workspace but worth handling), fall back to `fs.copyFile` + `fs.unlink`.
5. Return `{ ok: true, newPath }`.

**No `withRenameLock`.** This is intentional and load-bearing. The workspace chokidar watcher fires `unlink(srcPath)` + `add(candidate)` events. ragIngest's `unlink` handler soft-deletes the old `rag_documents` row (`is_active = false`); its `add` handler ingests the new row + re-runs Gemini tag extraction. Same flow as the manual workaround (copy content + create new file + delete original) just compressed into one atomic file-op.

Cost: one Gemini Flash tag-extraction call per move (~$0.0002). Acceptable — same as the manual workaround.

Refuse conditions (return `{ ok: false, error: ... }`):
- Empty src or dest
- Src not found on disk / not a file
- Dest not found / not a directory
- Src already under destThreadPath (the user is moving the file into its current thread)
- 999+ collisions (theoretical — never hits in practice)

### 1.4 IPCs + preload + types

Two new IPCs in `src/main/ipc.ts`, registered right after `thread:purge-summary`:

- `doc:list-threads-flat` — reads `cfg.projectsRoot` from `loadConfig()`, returns `{ ok, error?, threads }`. The `excludeThreadPath` argument is optional; renderer passes the active thread's path so the picker omits it.
- `doc:move-to-thread` — straight pass-through to `moveDocumentToThread(args.srcPath, args.destThreadPath)` with `console.log` / `console.error` on the result.

Two new preload bindings in `src/preload/index.ts`:
- `docListThreadsFlat(excludeThreadPath?)` → `ipcRenderer.invoke('doc:list-threads-flat', { excludeThreadPath })`
- `docMoveToThread(srcPath, destThreadPath)` → `ipcRenderer.invoke('doc:move-to-thread', { srcPath, destThreadPath })`

Both typed in `src/renderer/src/types/ipc.ts` with full return shapes.

### 1.5 The renderer wiring in `SidebarCell.tsx`

State adds (just below `renaming`):
- `movingFile: { path, name } | null` — drives the modal open/closed
- `toast: string | null` — drives the bottom-center transient

Context-menu item (file branch, between "Rename" and the `<CMDiv />`):
```tsx
<CMI label="Move to thread…" onClick={() => {
  setMovingFile({ path: contextMenu.entry.path, name: contextMenu.entry.name })
  setContextMenu(null)
}} />
```

Modal render (via `createPortal` to `document.body`, after the empty-area context menu):
```tsx
{movingFile && createPortal(<MoveDocModal ... />, document.body)}
```

Toast render (also via `createPortal`, just after the modal):
```tsx
{toast && createPortal(<div style={...toastStyles}>{toast}</div>, document.body)}
```

`MoveDocModal` is a new sub-component defined at the bottom of `SidebarCell.tsx` next to `CMI` / `CMDiv` / `HBtn`. Self-contained — fetches threads on mount via the new IPC, holds its own search + busy state, calls `onMoved(threadName, newPath)` on success or sets internal `error` on failure. Backdrop click + Escape both call `onClose`.

After a successful move, the parent `onMoved` callback:
- Calls `useScribeStore.getState().closeFile(movingFile.path)` — the open file (if any) had a stale path; the user re-opens from the new location via Codex or the file tree.
- Closes the modal.
- Sets the toast string.
- Calls `triggerSidebarRefresh()` so the tree re-fetches and the old entry disappears immediately (instead of waiting for chokidar's 1 s poll cycle).
- Schedules a 3 s `window.setTimeout` to clear the toast.

### 1.6 What it doesn't do

- **No batch move.** Multi-select context-menu actions (Re-ingest, Convert, Delete) take a `selectedPaths` array. Move-to-thread is single-file in v1 — moving N files into one thread is a clear use case but adds modal-UX complexity (per-row collision handling, per-row failures). Punt to a future session if Andy asks.
- **No "Move to References/<subfolder>" targeting.** Destination is always `<thread>/References/<basename>`. Users who want a different layout can rename afterward.
- **No Honcho memory rewrite.** Memory summaries may cite the old path; Honcho normalizes on the next compression. Cited paths in old summaries become dead links — acceptable tradeoff per the Session 6 prior in `gotcha.md` originally drafted before the feature was built.
- **No undo.** The move is one-shot; reversing means manually moving the file back. Andy is the quality gate — no automatic undo for a destructive file-system action.

---

## Chapter 2 — Part B: Selected-node spotlight

### 2.1 The `aggressive` gate

New variable in `applyStyles`:
```ts
const aggressive = !!sel  // Session 6 Part B — sel-only spotlight
```

`sel` is read from `selectedIdRef.current` (which mirrors the Zustand `selectedNodeId` state via the existing selection-sync useEffect). When a node is selected, `aggressive` is true; when only hovering or doing nothing, it's false.

### 2.2 Node opacity ladder

The pre-Session-6 single `dimmed` boolean drove a binary 0.4 / 1.0 split. Session 6 splits this into a tri-state when aggressive:

```ts
if (aggressive) {
  if (isFocus)    { coreOpacity = 1;    textOpacity = 1    }   // selected + hover-while-sel
  else if (isNbr) { coreOpacity = 0.8;  textOpacity = 0.8  }   // direct neighbors
  else            { coreOpacity = 0.15; textOpacity = 0.15 }   // everything else
} else if (focusDimmed) {
  coreOpacity = 0.4; textOpacity = 0.3                          // legacy hover-only dim
} else {
  coreOpacity = 1;   textOpacity = 1
}
```

`focus = hoverId ?? sel` is unchanged — hover takes precedence over selection for which node is "the focus" (you can preview a different neighbor while one is selected). `nbrs` similarly is hover-driven when hovering, sel-driven otherwise. The aggressive opacity values are anchored to whichever focus/nbrs are active.

### 2.3 Edge opacity

```ts
if (incident) return Math.min(1, baseO + 0.5)               // unchanged — boost incident
if (focus)   return aggressive ? 0.05 : baseO * 0.22        // Session 6 — aggressive vs legacy
return baseO                                                // unchanged — no focus
```

`baseO * 0.22` was the legacy hover-dim multiplier; `0.05` is the aggressive flat absolute. The `incident` boost stays at `+0.5` because the user wants to see the selected node's actual connections at full strength.

### 2.4 Halo dim factor

```ts
let haloMul = 1
if (dimmed) haloMul = aggressive ? 0.12 : 0.35              // Session 6 — sharper halo dim
if (isNbr)  haloMul = Math.max(haloMul, 1.3)
if (isSel)  haloMul = Math.max(haloMul, 1.6)
if (isHover) haloMul = Math.max(haloMul, 1.9)
```

The halo dim drops from `0.35×` to `0.12×` when aggressive — the soft glow that the original "living cell" aesthetic depends on visually retreats when the user is in inspection mode. Selected node's `1.6×` and hover's `1.9×` boosts remain — the active node still pulses prominent against the dimmed background.

### 2.5 Search overlay interaction

Pre-Session-6, the `dimmed` boolean ORed the focus state with the search-mismatch state, so a search-mismatched node looked identical to a non-neighbor. Session 6 splits these:

```ts
const searchMiss = !!q && !d.title.toLowerCase().includes(q)
const focusDimmed = !!focus && !isFocus && !isNbr
const dimmed = focusDimmed || searchMiss                    // still used for halo
```

Then after the focus-state ladder, the search overlay clamps to a floor:

```ts
if (searchMiss) {
  const floor = aggressive ? 0.15 : 0.3
  coreOpacity = Math.min(coreOpacity, floor)
  textOpacity = Math.min(textOpacity, floor)
}
```

So a node that's a direct neighbor of the selected node (0.8) but doesn't match the search query (floor 0.15 when aggressive) gets clamped to 0.15. The search filter overrides — the user explicitly typed a query.

---

## Chapter 3 — Part C: Structural gap dashed lines

### 3.1 `graphAnalytics` request bump

Single-character change with semantic weight:

```diff
- const a = await window.electronAPI.graphAnalytics({ ...scope, topInfluential: 1000, topGaps: 0 })
+ const a = await window.electronAPI.graphAnalytics({ ...scope, topInfluential: 1000, topGaps: 10 })
```

The IPC + main-side computation is unchanged — `graphAnalytics` already supports `topGaps`; Session 1 wired it but didn't request gaps from the Graph tab. Now we do.

### 3.2 `graphStore.structuralGaps`

```ts
import type { AnalyticsGap } from './synthesesStore'

interface GraphStore {
  ...
  structuralGaps:    AnalyticsGap[]
  setStructuralGaps: (g: AnalyticsGap[]) => void
}
```

Default `[]`. The shape (`{ id, communityA: { id, name, memberCount }, communityB: { id, name, memberCount }, gapSize, interEdgeCount }`) is identical to the one already used in `synthesesStore` — no new type, just an import.

### 3.3 The `gapLinesG` group

Created in the build effect **before** `edgesG` so gap lines paint behind everything (background structure, not foreground emphasis):

```ts
const zoomG = svg.append('g')
const gapLinesG = zoomG.append('g').attr('class', 'graph-gap-lines')
gapLinesGRef.current = gapLinesG
const edgesG = zoomG.append('g').attr('class', 'graph-edges')
const nodesG = zoomG.append('g').attr('class', 'graph-nodes')
```

Two new refs: `gapLinesGRef` (the group) and `gapLineSelRef` (the per-gap `<line>` selection — re-bound separately).

### 3.4 The gap-data binding effect

Separate `useEffect` (NOT inside the build effect) so a gap change doesn't tear down the simulation:

```ts
useEffect(() => {
  const parent = gapLinesGRef.current
  if (!parent) return
  const visible = useConstellation ? structuralGaps : []
  const sel = parent.selectAll<SVGLineElement, AnalyticsGap>('line')
    .data(visible, (gap) => gap.id)
    .join(
      (enter) => enter.append('line')
        .attr('stroke', 'var(--text-dim)')
        .attr('stroke-opacity', 0.15)
        .attr('stroke-linecap', 'round')
        .style('pointer-events', 'none'),
      (update) => update,
      (exit)   => exit.remove(),
    )
  gapLineSelRef.current = sel
  const inv = 1 / currentZoomRef.current
  sel.attr('stroke-dasharray', `${8 * inv} ${4 * inv}`).attr('stroke-width', 1 * inv)
  const s = simRef.current
  if (s) s.alpha(Math.max(s.alpha(), 0.05)).restart()
}, [structuralGaps, useConstellation, graphData])
```

Three reasons it depends on `graphData`:
1. When the graph rebuilds, `gapLinesGRef` is overwritten; this effect needs to re-bind onto the new group.
2. When the user switches theme, `useConstellation` flips and we want to empty / refill the bind cleanly.
3. When analytics finishes and `structuralGaps` populates, we want lines to appear.

The `sim.alpha(...).restart()` at the end is a small but important nudge — without it, freshly-mounted lines sit at `x1=y1=x2=y2=0` (centered at world origin) until the perpetual-drift tick happens to fire from the `alphaTarget(0.012)` floor. Bumping alpha to 0.05 kicks one immediate tick that recomputes centroids and lands the lines at real positions in the same paint frame.

### 3.5 Centroid computation in the tick handler

Inside `sim.on('tick', ...)` — the standard place where edge endpoints get refreshed:

```ts
const gapSel = gapLineSelRef.current
if (gapSel && !gapSel.empty()) {
  const sums = new Map<number, { sx: number; sy: number; n: number }>()
  for (const n of nodeData) {
    const ana = perNodeAnalytics.get(n.id)
    if (!ana) continue
    const x = n.x ?? 0, y = n.y ?? 0
    const s = sums.get(ana.community)
    if (s) { s.sx += x; s.sy += y; s.n += 1 }
    else   { sums.set(ana.community, { sx: x, sy: y, n: 1 }) }
  }
  const centroids = new Map<number, { x: number; y: number }>()
  for (const [cid, s] of sums) centroids.set(cid, { x: s.sx / s.n, y: s.sy / s.n })
  gapSel
    .attr('x1', (gap) => centroids.get(gap.communityA.id)?.x ?? 0)
    .attr('y1', (gap) => centroids.get(gap.communityA.id)?.y ?? 0)
    .attr('x2', (gap) => centroids.get(gap.communityB.id)?.x ?? 0)
    .attr('y2', (gap) => centroids.get(gap.communityB.id)?.y ?? 0)
}
```

Cost: O(N + G) per tick, where N is visible nodes and G is gap count. With Andy's ~500-node corpus + ~10 gaps, that's ~500 multiplications + ~10 map lookups + 4×G attribute writes — trivially under 1 ms on the ~16 ms tick budget.

Short-circuits when `gapSel.empty()` (Cell theme, or Constellation theme without gaps yet) so the cost is literally zero outside Constellation-with-gaps mode.

### 3.6 Dash counter-scaling

`applyNodeScale` (called from the zoom handler) gets one new block:

```ts
const gapSel = gapLineSelRef.current
if (gapSel) gapSel.attr('stroke-dasharray', `${8 * inv} ${4 * inv}`)
```

Plus the gap-bind effect sets the initial dash on first paint using `1 / currentZoomRef.current`. So dashes stay pixel-constant across zoom — the same treatment the hierarchy-edge dashes already get in `applyStyles`.

### 3.7 What we deliberately did NOT add

- **No midpoint "gap" label.** Spec called this "optional, only if not too cluttered" — at 10 gap lines with the existing wiki tier labels, adding 10 more text elements would clutter. If Andy wants them later, the centroid map computed in the tick handler is the right place to hang midpoint coordinates.
- **No gap-line hover tooltip.** `pointer-events: none` means gap lines aren't interactive. Gap information lives in the Syntheses panel, which has full clickable rows.
- **No theme-aware color.** `var(--text-dim)` reads correctly on the dark `#0a0a0f` Constellation background; if we ever ship the "Theme 3 — Blueprint" lighter variant, the gap-line color will need to flip with the theme. Flagged for whenever Fey work lands.

---

## Chapter 4 — Part D: BC-driven brightness mapping

### 4.1 The formula

In `graphData.useMemo`'s per-node mapping, when in Constellation theme + the node has analytics + maxBC > 0 + the node is raw (not wiki):

```ts
const nBC = Math.min(Math.max(ana.betweenness / maxBC, 0), 1)
const c = d3.hsl(base)
if (Number.isNaN(c.h)) c.h = 0
if (Number.isNaN(c.s)) c.s = 0
c.l = 0.4 + nBC * 0.6     // 0.4 (dark) → 1.0 (white at peak BC)
c.s = 0.65 - nBC * 0.35   // 0.65 (saturated) → 0.30 (faded at peak BC)
core = c.formatHex()
```

`base` comes from `communityColor(ana.community)` (already computed earlier in the same `.map(...)`) — the Louvain palette hue at constant lightness/saturation. The brightness mapping overrides lightness + saturation while preserving hue, so each node's community membership is still visible in the color wheel but its brightness encodes its structural importance.

### 4.2 Why saturation drops as BC rises

The instinct is "high-BC = important = make it loud (saturated)". The visual instinct is the opposite:
- A near-white node reads as **light** (high lightness + low saturation = pastel/white tone)
- A vivid saturated node reads as **alive but small** (mid lightness + high saturation = pure color)

We want high-BC bridges to read as "bright cores" and low-BC satellites as "saturated dots". So saturation INVERSELY scales with BC. The narrow-band Fey-adjacent palette already uses moderate saturation (0.45 community-base); the inversion pulls high-BC nodes into the near-white pale range while keeping satellites in the vivid saturated range.

### 4.3 The wiki exemption

```ts
if (useConstellation && ana && maxBC > 0 && cls === 'raw') { ...BC mapping... }
else { core = coreColorFor(cls, base) }
```

Wiki-tier nodes always fall through to `coreColorFor`, which applies the tier-specific brightening (`{sat: 1.3, light: 1.25}` for domaine-wiki etc.) on top of the Domaine/community color. Reasoning:

- Wiki nodes have BC = 0 in `rag_relationships` because wiki edges aren't in that table (wiki-page-to-source links live in `rag_wiki_page_sources`, a separate join table). A BC-driven brightness would render them ALL at the dimmest end (lightness 0.4) — visually wrong for structural anchors that the user navigates by.
- The existing tier-specific brightening already encodes hierarchy (domaine-wiki brighter than project-wiki brighter than thread-wiki) — a sensible visual order independent of BC.

If wiki edges ever get added to `rag_relationships`, this exemption can drop and the formula will naturally pull domaine-wiki near-white (highest BC by membership).

### 4.4 Why not `light * (0.4 + nBC * 0.6)` (multiplicative)

Spec says "brightness = 0.4 + (normalizedBC * 0.6)". Multiplicative interpretation (`c.l = c.l * (0.4 + nBC * 0.6)`) would scale the existing lightness — but the community-color base is already lightness 0.62, so the product at peak BC would be `0.62 × 1.0 = 0.62`, never near-white. The absolute interpretation (`c.l = 0.4 + nBC * 0.6`) is the one that produces the spec's "high-BC trends to near-white". We use absolute.

### 4.5 Zoom verification (no code change)

Per the spec: "verify the zoom behavior is correct... Confirm it's working as intended." The existing `labelOpacityFor` ladder:

```
k < 2.0           → 0 (raw)         — only wiki anchors visible
k ≥ 2.0, < 3.5    → degree > 6      — high-degree raw docs
k ≥ 3.5, < 5.0    → degree > 3      — mid-degree raw docs
k ≥ 5.0           → all raw
```

Since k INCREASES as the user zooms IN (d3.zoom convention), this maps: zoomed out (small k) → wiki anchors only = structure / zoomed in (large k) → progressively more detail. **Direction is correct, not inverted.**

The one cosmetic refinement worth flagging (known-limits §1): in Constellation theme the gate uses **degree** rather than **BC**, so the big high-BC bridge nodes (sized by BC, brightened to near-white) are unlabeled at low zoom even though they're the most prominent things in view. A symmetric BC-driven label gate would make Constellation labels match its size + brightness encoding. Deferred — Andy asked to verify, not refine.

---

## Verification at Session 6 end

```
npm run db:setup                        → migrations 009 + 010 + 011 applied (unchanged from Session 5)
npm run test                            → 6 files / 28 tests passed (~2.0 s)
npx tsc --noEmit -p tsconfig.web.json   → 6 pre-existing errors, 0 new
npx tsc --noEmit -p tsconfig.node.json  → 4 pre-existing errors, 0 new
```

Net delta in pre-existing tsc errors: **0** (Session 6 didn't fix any; none of the pre-existing errors are in files Session 6 touched).

---

## Files touched in Session 6

### Main process (restart required)

- `src/main/projectFs.ts` — added `listAllThreadsFlat()` (walks Domaine/Project/Thread tree, returns flat alphabetical list) + `moveDocumentToThread()` (atomic file move with EXDEV fallback + collision avoidance). Both inserted between `moveThread` and `purgeThread`.
- `src/main/ipc.ts` — 2 new handlers (`doc:list-threads-flat`, `doc:move-to-thread`) + 2 new function imports from `projectFs`.

### Preload + types (restart + Cmd+Shift+R required)

- `src/preload/index.ts` — 2 new bindings (`docListThreadsFlat`, `docMoveToThread`).
- `src/renderer/src/types/ipc.ts` — 2 new electronAPI type defs with full return shapes.

### Renderer (hot-reloads)

- `src/renderer/src/components/layout/SidebarCell.tsx` — "Move to thread…" CMI item + `movingFile`/`toast` state + portal-mounted `MoveDocModal` + portal-mounted toast + the `MoveDocModal` sub-component at the bottom of the file (~190 LOC added total).
- `src/renderer/src/components/codex/Graph.tsx` — Part B aggressive spotlight in `applyStyles`, Part C gap-line group + tick centroid computation + dash counter-scaling + gap-data binding effect, Part D BC-driven brightness in `graphData.useMemo`, `topGaps: 0 → 10` in the analytics fetch, two new refs (`gapLinesGRef`, `gapLineSelRef`), one new import (`AnalyticsGap` from synthesesStore).
- `src/renderer/src/store/graphStore.ts` — `structuralGaps` state + `setStructuralGaps` action + `AnalyticsGap` import.

---

## What Session 6 did NOT touch (per scope)

- `themes.ts` / Fey design work — untouched.
- The 10 pre-existing tsc errors — Session 8 still owns them.
- `tsconfig.web.tsbuildinfo` — perpetually-dirty autogen, ignored.
- Migrations 001–011 — no new migrations.
- Honcho, Hermes, Foundry logic — Sessions 2, 5, 4 respectively own these surfaces.
- The zoom-behavior label ladder — verified correct, no code change (cosmetic refinement deferred — see known-limits §1).
- The Cell theme — gap lines + BC-brightness are Constellation-only; Cell theme renders identically to pre-Session-6.

---

## Known limits carried into Session 7+

1. **Label gate uses `degree`, not BC, in Constellation theme.** The `labelOpacityFor` zoom ladder gates raw-doc labels by `d.degree` (> 6 / > 3) — matches the Cell theme's degree-driven size, but mismatches Constellation's BC-driven size. So at low zoom (`k < 2.0`), the big high-BC bridge nodes (sized and brightened by BC) are UNLABELED — only wiki anchors show. Cosmetic, low priority. Fix when convenient: add a Constellation-specific branch in `labelOpacityFor` that gates by `nBC > 0.3` / `nBC > 0.15` at the same zoom thresholds. Don't fix without thinking — `degree` is correct in Cell theme; the fix is theme-aware, not a global change.

2. **Domaines navigation loses drill-down state on tab switch.** Clicking from Scribe → Domaines → drilling into a Domaine → switching to Codex → back to Domaines = you're back at the root list, not where you were. Session 7 fix per Andy's scope list. Pattern to mirror: how `ingestStore.selectorDomaineId` / `codexWikiStore.selectorDomaineId` / `graphStore.selectorDomaineId` persist as `''` defaults but stay across tab switches once the user picks. The Domaines drill-down state belongs in `domainesStore` (or `sessionStore`) as a `viewState: { mode: 'root' | 'domaine' | 'project'; domaineId?; projectId? }` shape.

3. **Single-select Domain filter on the Graph.** Current `select`-element dropdown lets you pick `(All Domaines)` or one specific Domaine. Session 7 should replace this with a multi-select checkbox list so Andy can filter to "AstraStrata + Dwellium" without falling back to "All". Don't add more single-select filters to the graph — build the multi-select properly once and reuse the pattern.

4. **Toast is local React state, not a global system.** `SidebarCell`'s `toast` state is component-local — a successful Move shows the toast on THIS sidebar cell. If Andy opens a second split sidebar and moves from there, the toast renders there. That's actually fine for v1 (toasts are co-located with the action) but if a future feature wants to surface a toast from a different surface (e.g. "Foundry admitted X" notification while the user is in Codex), a global toast queue is the right shape. Pattern: `useToastStore` with `pushToast(msg, ms?)` + auto-clear; component anywhere in the app renders the queue in a portal. The existing `compressNote` in `ChatPane` is another instance of the same "local toast" pattern — both can converge on the global store when one's worth building.

5. **No batch move-to-thread.** v1 only handles single-file moves. Multi-select context-menu actions (Re-ingest, Convert, Delete) already exist with `selectedPaths`; extending Move would mean per-row collision handling + per-row failures in the modal. Not blocking, not promised. Add when Andy asks.

6. **No undo on move.** Move-to-thread is destructive in the file-system sense (the original file disappears). No undo flow. Same as Delete, Rename, etc. Acceptable for a single-user trusted-environment tool.

7. **Open-file path becomes stale on move.** If the file being moved is open in Scribe, `scribeStore.closeFile(srcPath)` runs after the move so the editor doesn't hold a stale reference. The user has to re-open from the new location. Re-opening at the same scroll position / unsaved-edits state isn't handled — same constraint as Delete (a deleted open file just disappears from the editor). If Andy ever wants "move and reopen at new path", the post-move callback would `openFileWithContent(newPath)` after closing the old. Not built — explicit choice for simplicity.

8. **Re-ingest cost on every move.** Each move triggers Gemini Flash tag re-extraction via the `add` event. ~$0.0002 per move on Flash, but visible in the spend ledger. Andy is on a flat-rate API plan so this rarely matters; surface in cost dashboards if a future "bulk reorganize" workflow blows the budget.

9. **`config.gemini` / `config.anthropic` workaround pattern is now in FIVE places.** Move-to-thread doesn't trigger it directly (no LLM calls), but the workaround it relies on (chokidar → ragIngest → Gemini) is the same pattern. The local-assertion workaround at `ragIngest.ts:234`, `foundry.ts:480`, `ipc.ts:1478`, `hermes.ts` plain-message handler still has a TS2339 error. Worth fixing all five at once in Session 8 by adding `gemini` + `anthropic` to the `HolocronConfig` interface.

10. **`ipc.ts:527` TS2345 drifted with the two Session 6 IPC handlers.** The line number that hosts the existing `path.basename` in `.map(...)` error moved with the file edits — still the same root cause, just a different line. Session 8 will catch it.

---

## Hand-off (Session 6 final)

1. **Read `STATUS.md` first** (refreshed at Session 6 end), then `architecture-v4.md` §9 (Working Memory panel) + §11.2 (Priority UI Improvements). Session 7 is the Working Memory panel + the small UX cleanups queued from earlier sessions.
2. **`gotcha.md` has four new Session 6 priors at the bottom** under `## Session 6 priors`, plus the multi-select-domain-filter prior that gates a Session 7 decision. Read those before debugging anything graph-related or contemplating new graph filters.
3. **Don't relitigate "aggressive only on click-select".** Hover stays gentle; aggressive isolation is reserved for click-locked inspection. The two-state gate is deliberate.
4. **Don't merge gap lines into the edges group.** They're a separate `<g>` deliberately behind edges. Keeping them as their own layer means future filter toggles (e.g. "show gaps · hide gaps") and theme switches don't have to surgically pick lines out of the edges selection.
5. **Don't add a global toast store as a side-effect of Session 7.** It's a clean cleanup whenever someone wants to do it, but Session 7's scope is the Working Memory panel + Domaines persistence + multi-select Domain filter + auto-delete-Inbox-after-admission. Don't pile work onto the polish session.
6. **`npm run dev` restart required after any `src/main/` change** — Part A's main-process additions mean restart + Cmd+Shift+R for any preload binding change.
7. **Move-to-thread bypasses `withRenameLock` intentionally.** If someone "fixes" this in a future session by adding the lock, the SQL state will never update and orphan rows will accumulate. The lock is for cases where SQL state is updated explicitly INSIDE the lock; move-to-thread defers to chokidar.
8. **Don't rename the Honcho workspace.** Still hardcoded at `honcho.ts:1` (`const WORKSPACE_ID = 'holocron'`). Renaming would orphan every existing thread's `honchoSessionId`. (Carry-forward from Session 5 prior.)

🍣
