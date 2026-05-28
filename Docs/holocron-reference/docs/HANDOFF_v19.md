# Handoff v19 — Architecture-v4 Session 7 (first pass)

**To:** the next Claude session
**From:** Session 7 partial sign-off, 2026-05-14. Seven landed chapters, four remaining items carried into Session 7's second pass. This is a **partial sign-off** — Session 7 is not closed; it's split into "what shipped on the first run" (this doc) and "what's still pending" (the known-limits list at the bottom). The seven shipped chapters mix UX, schema, and architectural cleanup — none of them were on the original Session 7 spec but each one was a bug or friction point worth a targeted pass while the codebase was already open.

  - **Chapter A** — `References/` folder removed as a destination: the Foundry approve pipeline (`foundry.approveItem`) + Scribe Move-to-thread (`projectFs.moveDocumentToThread`) + IntakeModal's first-load drop (`projectFs.addReferencesToThread`) + the wiki-to-thread copy (`ragWiki.importWikiToThread`) now all write files directly to the thread root. `_Codex/References/` cross-Codex cache is unchanged (it's parallel to `_Codex/Wiki/` and `_Codex/Syntheses/`, not a thread destination). Existing `References/` folders on disk are left in place — only NEW writes land at the root. `ragIngest.detectSourceType`'s path-position rule still classifies files in any `References/` folder as `source_type='reference'` AND defaults thread-root files to `'reference'` too, so the classification label is unaffected (gotcha v13 priors line 65). Four user-visible UI strings tightened to match (IntakeModal description, GeneralTab toggle copy, CodexPreview import tooltips, SidebarCell move-modal subtitle).
  - **Chapter B** — File-resurrection race fixed in `ragIngest.processIngest`: the wikilink writeback at line 710 was unguarded, so when a user deleted or moved a file between ingest-enqueue (chokidar `add` ~2 s after Foundry approve) and writeback completion (~5–10 s later, after Gemini extract + wikilink injection), the writeback resurrected the file at its original path. Now guarded by `fs.stat(data.filePath)` + a `SELECT id FROM rag_documents WHERE source_path = $1 AND is_active = true LIMIT 1` — OR logic, either failing short-circuits the entire writeback block (disk write, content UPDATE, edge logging) with `[ragIngest] wikilink writeback skipped — file no longer at <path> (deleted or moved)`. Same guard catches both delete and move-to-thread races.
  - **Chapter C** — "Expand all" in the Scribe sidebar now recurses through every subfolder, not just the top level. BFS walker with bounded parallelism (16 `loadDir` calls in flight per batch), 5000-dir cap (mirrors `ingest:sync-workspace`'s runaway guard), `visited` set to short-circuit symlink cycles. Collected paths all written to `setExpandedPaths` in one call.
  - **Chapter D** — `AnchoredDropdown` shared component (`src/renderer/src/components/AnchoredDropdown.tsx`, new file, ~225 LOC): `createPortal` to `document.body` + `getBoundingClientRect` on the trigger + flip-up when near viewport bottom + repositions on resize/scroll. Replaces native `<select>` for cases where the macOS NSPopupButton convention (Chromium renders selects with the current value over the trigger) reads as "popping mid-screen." Wiki.tsx's local `OptionDropdown` deleted (~155 LOC removed); migrated to the shared component. Codex Ingest's three filter dropdowns (Type / Tier / Domain) migrated from native `<select>`. Search.tsx / Syntheses.tsx / Graph.tsx / ApproveForm.tsx / ConnectionsTab.tsx / ScribeTab.tsx native selects kept for now — only call out the ones that misbehave.
  - **Chapter E** — Validation card DB fix (symmetric): the Hive's "Run sweep now" INSERT (`ipc.ts:1522`) and the validation-stats SELECT (`hive.ts:131`) BOTH used wrong column names (`kind`, `payload`) — the actual `rag_operations_log` schema (migration 001) has `operation` and `details`. The SELECT crashed every Validation card load with `column "kind" does not exist`. The INSERT failed silently into its `.catch` on every "Run sweep now" click → **zero `validation_sweep` rows have ever been written** in the history of the codebase. Fixed both — SELECT aliases back to legacy names (`operation AS kind, details::text AS payload`) so `ValidationStats.recentSweeps` shape stays stable for downstream consumers. Sparkline starts populating from the next Run-sweep click.
  - **Chapter F** — Triage content cap removed in `foundry.triagePrompt`: pre-Session-7 cap was 8 KB for URL captures + 24 KB for authored content. Gemini Flash has a 1 M-token context window — those caps were premature defensiveness from a model with much smaller limits. Full post-cookie-strip content now flows to the model. `maxTokens` for **extract** mode bumped 8192 → 16384 so a 30-KB article can return its proportionally larger cleaned rewrite (~5–8 K output tokens + thinking budget + JSON wrapper) without truncation. **Convert** mode stays at 1024 (metadata-only output). `stripCookieBoilerplate()` retained for URL captures — cookie walls are pure noise and worth stripping before the prompt. New one-shot log `[Foundry/triage] sending N chars to Gemini (mode=<extract|convert>)` is the truth source for "what did Gemini actually see."
  - **Chapter G** — Large-doc 20K-char size warning (two surfaces): a soft amber inline hint that fires when extract mode is about to receive (or has just received) a document that's likely to time out or return truncated cleaning. **IntakePanel** — `lastFileSize` state tracks the most-recent dropped/picked file; render gated on `lastFileSize > 20_000 && fileMode === 'extract'`. Reactive — flips to Convert hides the warning. **FoundryItemCard** — same hint shows on URL captures after Firecrawl returns, gated on `variant === 'pending' && sourceType === 'url' && triageMode === 'extract' && rawContent.length > 20_000`. Static per card (triage_mode is locked into the row at capture time). Uses `rawContent.length` as a renderer-side proxy for the post-cookie-strip length — slightly overstates, conservatively biased toward warning.

**You are starting:** the MVP + v13 + v14 + Sessions 2–6 baseline is intact, plus the seven Session 7 first-pass chapters above. **Architecture-v4 Session 7 is HALF DONE.** The remaining four Session 7 items (auto-delete Inbox after Foundry admission, Domaines navigation state persistence, multi-select Domain filter on the graph, Working Memory panel) carry forward to the Session 7 second pass — see known-limits §1–§4. **Session 8 (code health)** is still the planned next chapter once Session 7 closes.

---

## 🛑 READ FIRST — verification rules (unchanged)

`npx tsc --noEmit -p tsconfig.web.json` for renderer changes. `npm run typecheck`'s `&&` still short-circuits on the node-side pre-existing errors; check the renderer alone with the explicit per-project invocation. Main-process changes need a full `npm run dev` cycle; renderer hot-reloads. `npm run test` = 28 vitest tests against the real test Postgres. **Still 28/28 at session end.** Zero new tsc errors introduced this pass; no pre-existing errors fixed (Session 8 still owns the triage pass).

### Pre-existing tsc errors after Session 7 partial

Node-side: **4 errors** (unchanged from end of Session 6):

| File | Line(s) | Code | Note |
|---|---|---|---|
| `src/main/cleanupOps.ts` | 517 | TS2322 | `withRagClient` returns `number\|null` |
| `src/main/dashboard.ts` | 54 | TS18047 | `res.rowCount` nullable |
| `src/main/ipc.ts` | 527 | TS2345 | `path.basename` in `.map(...)` — drifted again with this pass |
| `src/main/ragIngest.ts` | 234 | TS2339 | `config.gemini` not on `HolocronConfig` — workaround pattern in 4 places |

Web-side: **6 errors** (unchanged):

| File | Line(s) | Code | Note |
|---|---|---|---|
| `src/renderer/src/components/chat/ChatMessage.tsx` | 67 | TS2353 + TS7031 | react-markdown component override |
| `src/renderer/src/components/codex/CodexPreview.tsx` | 1419, 1518 | TS2345 + TS2352 | ScribeColorTheme + ReactPortal |
| `src/renderer/src/components/hud/HUD.tsx` | 50 | TS2367 | `'dashboard'` literal vs `AppTab` |
| `src/renderer/src/components/scribe/selectionObserver.ts` | 14 | TS2344 | PluginValue |

Total **10 errors remaining** (unchanged from end of Session 6). Filter typecheck output for files YOU touch. Don't fix the above unless explicitly tasked — Session 8 is the dedicated triage pass.

---

## Read order (~25 min)

1. **`docs/STATUS.md`** — refreshed at this sign-off (points at Session 7 second pass next).
2. **This file** (HANDOFF_v19) — the Session 7 first-pass chapter.
3. **`docs/gotcha.md`** — Session 7 priors block at the bottom has four new entries (extract-mode timeout threshold, validation-card historical bug, AnchoredDropdown migration rule, wikilink writeback guards — do not remove).
4. **`docs/architecture-v4.md`** §9 (Working Memory panel — the meatiest Session 7 remaining item) + §11.2 (priority UI improvements). Part 12 still has the session sequence.
5. **`docs/HANDOFF_v18.md`** Session 6 chapter — context for the Graph overhaul and Move-to-thread (whose `References/` destination is what this pass changed).

---

## Decisions locked at this pass (do not relitigate)

- **`References/` removal applies to THREAD destinations only.** The `_Codex/References/` cross-Codex fallback (used by Foundry approve when no thread is assigned) stays — it sits parallel to `_Codex/Wiki/` and `_Codex/Syntheses/` as a structured cache, not a thread layout. The `source_type='reference'` classification label is independent of folder naming (path-position rule in `detectSourceType`).
- **Existing `References/` folders on disk are NEVER touched.** No migration, no rename, no copy. Only NEW writes land at the thread root. Users with months of `References/`-organized content keep it exactly as-is; the rule is forward-only.
- **Move-to-thread still bypasses `withRenameLock`.** Carries forward from Session 6 — chokidar's `unlink + add` is what drives the SQL reconciliation. The wikilink-writeback guards added this pass (Chapter B) are what make moves SAFE; without them, the writeback would resurrect the source path after the rename. **Don't remove the guards thinking they're paranoid** — they're the load-bearing piece that makes Session 6's Move-to-thread + this session's References-removal work together.
- **`AnchoredDropdown` is the canonical anchored-dropdown.** Future dropdowns that misbehave should migrate to this component, not fix `position: absolute` CSS in their own callsite. The existing native `<select>` in Search / Syntheses / Graph / ApproveForm / Connections / ScribeTab are left alone — migrate when they actually surface as a problem, not preemptively.
- **Triage content cap is gone permanently, not "tuned higher."** If pathological multi-MB drops become a problem, the gate belongs at capture-time (URL / file / paste IPC entry points), not at triage. Capture-time gating is closer to where the user can correct the input; triage-time gating obscures what went wrong.
- **Validation card sparkline starts populating from NEXT click.** Because the INSERT has been silently failing for the entire history of the codebase, there are zero historical rows to backfill. The card has been (correctly) showing "no recent sweeps" because… there have been none.

---

## Chapter A — `References/` folder removed

### A.1 The five path-construction sites

| File:line | Function | Old | New |
|---|---|---|---|
| `foundry.ts:759` | `approveItem()` thread-target | `path.join(args.targetThreadPath, 'References')` | `args.targetThreadPath` |
| `foundry.ts:763` | `approveItem()` `_Codex` fallback | unchanged — `path.join(libraryRoot, 'References')` | unchanged |
| `projectFs.ts:270` | `addReferencesToThread()` (IntakeModal first-load) | `path.join(threadPath, 'References')` | `threadPath` directly + `fs.mkdir(threadPath, { recursive: true })` |
| `projectFs.ts:1385–1397` | `moveDocumentToThread()` | dest dir was `<thread>/References/`; collision check refused if already in References subfolder | dest dir is `<thread>/`; collision check refuses only if already directly in thread root |
| `ragWiki.ts:1145` | `importWikiToThread()` (wiki → thread copy) | `path.join(threadPath, 'References', '<leaf>.md')` | `path.join(threadPath, '<leaf>.md')` |

The `_Codex/References/` fallback (`foundry.ts:763`) stays because it's the cross-Codex library cache, not a thread destination — sits alongside `_Codex/Wiki/` and `_Codex/Syntheses/`.

### A.2 The classification label is independent

`ragIngest.ts:105` has `if (seg === 'References') return 'reference'` — KEPT. This classifies any file inside a `References/` folder (existing folders on disk) as `source_type='reference'`. For NEW files at the thread root, the default branch of `detectSourceType` (path-position rule, gotcha v13 line 65) defaults to `'reference'` anyway. So both old and new files classify identically — same DB rows, same Codex Search filter results.

### A.3 UI text alignment

| File | Was | Now |
|---|---|---|
| `IntakeModal.tsx:59` | "Reference documents are copied into a `References/` folder inside…" | "Reference documents are copied into the thread folder…" |
| `GeneralTab.tsx:23` | "ask whether to drop reference documents into a `References/` folder" | "ask whether to drop reference documents into the thread folder" |
| `CodexPreview.tsx:571,710` | "Import to active thread's References folder" / "Copy to active thread's References folder" | "Import to active thread folder" / "Copy to active thread folder" |
| `SidebarCell.tsx:1295` | `→ <thread>/References/` | `→ thread root` |

`AdmittedConfirmation.tsx`, `ApproveForm.tsx`, `FoundryItemCard.tsx` still mention `_Codex/References/` — that path is unchanged.

### A.4 Why not migrate existing folders

Andy's instruction was explicit: "Do NOT rename or delete existing References/ folders on disk — just stop creating new ones." A migration would touch hundreds of paths across years of accumulated content, risk breaking external symlinks / Spotlight indexes / Obsidian vaults that share the directory, and introduce a one-shot DB row update for every moved file. Forward-only is the safe shape.

---

## Chapter B — File-resurrection race fixed

### B.1 The mechanism (now documented in code + gotcha)

Confirmed in Session 7's diagnostic pass:

1. User clicks Approve in Foundry → `approveItem()` writes file at `t=0`.
2. Chokidar fires `add` event at `t≈0.5–1.5 s` after `awaitWriteFinish` stabilizes.
3. `ragIngest.onFileEvent` debounces 2 s → enqueues a BullMQ job at `t≈2.5–3.5 s`.
4. Job runs `processIngest`: Gemini Flash tag extraction (2–5 s) + wikilink injection.
5. **Wikilink writeback at line 710 (UNGUARDED pre-Session-7)** writes `wikiLink.modifiedContent` to `data.filePath`.
6. **If the user deleted or moved the file between steps 1 and 5** (5–10 s window), the writeback at step 5 RECREATES the file at the original path.
7. Chokidar then sees the resurrected file as a new `add` event → another ingest cycle → new `rag_documents` row.
8. User clicks Refresh in Codex Ingest → re-queries `rag_documents` → resurrected row appears in the list. ("On Refresh" symptom.)

### B.2 The guard

Inserted at the top of the wikilink-injection block in `ragIngest.processIngest` (around line 710):

```ts
let stillOnDisk = true
try { await stat(data.filePath) }
catch { stillOnDisk = false }

let stillActive = stillOnDisk
if (stillOnDisk) {
  const active = await ragQuery<{ id: string }>(
    `SELECT id::text FROM rag_documents WHERE source_path = $1 AND is_active = true LIMIT 1`,
    [data.filePath],
  )
  stillActive = (active?.rowCount ?? 0) > 0
}

if (!stillOnDisk || !stillActive) {
  console.log(`[ragIngest] wikilink writeback skipped — file no longer at ${data.filePath} (deleted or moved)`)
} else {
  // ... original writeFile + DB content UPDATE + logWikilinkRelationships
}
```

**OR semantics, short-circuit on the cheap check.** If `stat` fails (file gone), the DB query never runs. Both checks together cover delete + move + out-of-band `rm`/Finder + any future deletion path.

### B.3 What's guarded — the whole block

The guard skips not just the disk write, but ALSO the `UPDATE rag_documents SET content` and `logWikilinkRelationships` calls below it. Otherwise a soft-deleted row would get a content overwrite + attached edges that nothing queries.

### B.4 Coverage matrix

| Scenario | Caught by |
|---|---|
| Scribe sidebar Delete | `stat` (file gone) AND `is_active=false` (chokidar `unlink` → `deleteDocument`) |
| Session 6 `moveDocumentToThread` | `stat` (file gone via `fs.rename`) + `is_active=false` |
| External `rm` / Finder delete | both checks |
| External `mv` out of workspace | both checks |
| Race where `unlink` event hasn't propagated yet | `stat` catches it before the DB row flips |
| Race where a new ingest fired against the same path | `is_active` check skips (new ingest will run its own wikilink pass on the fresh row) |

### B.5 Don't remove these guards

Carried into `gotcha.md` Session 7 priors. The guards look paranoid in isolation ("why check if a file we're about to write to exists?"), but they're the load-bearing piece that makes Session 6's Move-to-thread + Session 7's References-removal work together without resurrection. **If a future agent removes them thinking they're defensive bloat, the resurrect race comes back instantly.**

---

## Chapter C — Expand-all recursion

### C.1 The change

`handleToggleAction` in `SidebarCell.tsx` was filtering top-level entries only — subfolders within folders stayed closed. Replaced with BFS over the directory tree:

```ts
const MAX_DIRS = 5000
const BATCH    = 16
const queue: string[] = topDirs.map((d) => d.path)
const visited = new Set<string>(queue)
const allDirPaths: string[] = []
const newContents: Record<string, FsEntry[]> = {}

while (queue.length > 0 && allDirPaths.length < MAX_DIRS) {
  const batch = queue.splice(0, BATCH)
  const results = await Promise.all(
    batch.map(async (p) => ({ path: p, loaded: await loadDir(p) }))
  )
  for (const { path, loaded } of results) {
    allDirPaths.push(path)
    newContents[path] = loaded
    for (const e of loaded) {
      if (e.type === 'dir' && !visited.has(e.path)) {
        visited.add(e.path)
        queue.push(e.path)
      }
    }
  }
}
setDirContents((prev) => ({ ...prev, ...newContents }))
setExpandedPaths(cellId, allDirPaths)
```

### C.2 Why bounded parallelism

`loadDir` is a single IPC roundtrip per directory. Without batching, a tree with 200 directories would fire 200 concurrent IPC calls — main process queues them, but the message bus gets noisy. With `BATCH = 16`, we stay under typical IPC saturation. With ~500 directories at Andy's corpus size, the full expand completes in ~30 batches × ~50 ms each ≈ 1.5 s — well within "feels instant" territory for a one-shot action.

### C.3 The cycles guard

The `visited` Set is keyed by absolute path. A symlink-cycled tree (e.g. `~/Documents/foo` symlinking back to `~/Documents/`) would otherwise enqueue the same path repeatedly. The 5000-dir cap is a second safety net (matches `ingest:sync-workspace`).

---

## Chapter D — `AnchoredDropdown` shared component

### D.1 New file

`src/renderer/src/components/AnchoredDropdown.tsx` (~225 LOC). Exports `AnchoredDropdown` + `AnchoredDropdownOption` + `AnchoredDropdownProps`. Same options shape as Wiki's prior `OptionDropdown` so migration is mechanical.

### D.2 The two architectural choices

1. **`createPortal` to `document.body`** — the popover renders OUTSIDE every ancestor's transform / filter / contain context, so it isn't pulled around by a parent `transform: translate(...)` or `filter: blur(...)` somewhere up the tree. Standard "Session 1 Domains context menu" bug-fix pattern.
2. **`getBoundingClientRect` on the trigger + flip-up when near viewport bottom** — popover lands directly under the trigger by default; if rendering downward would clip below the viewport AND the trigger has more room above it, flip the anchor to the trigger's top edge. Initial flip decision uses an estimated popover height (option count × 28 px row, capped at 280 px); refined in `useLayoutEffect` once the popover has actually mounted and we know the real measured height.

### D.3 Lifecycle hooks

- Open → set initial anchor, register outside-click + Escape handlers
- Resize / scroll while open → recompute anchor (cheap — single rect read)
- Trigger becomes disabled mid-flight → close (e.g. "Across all Domaines" toggled while the Domaine dropdown is open)
- Mount-time `useLayoutEffect` → refine flip decision against measured popover height; flip if the initial estimate was wrong

### D.4 Migrations

| File | Was | Now |
|---|---|---|
| `Wiki.tsx` | Local `OptionDropdown` (~155 LOC) + 3 callsites | Imports `AnchoredDropdown` from `../AnchoredDropdown` + 3 callsites swapped |
| `Ingest.tsx` | 3 native `<select>` (Type / Tier / Domain) | 3 `AnchoredDropdown` callsites; `SOURCE_TYPE_OPTIONS` shape changed `key` → `value` to match the shared interface; `TIER_FILTER_OPTIONS` added; `domaineOptions` memoized at the top of the component |

Wiki's `SORT_OPTIONS` + `TIER_FILTER_OPTIONS` constants stay in `Wiki.tsx` as data (retyped to `AnchoredDropdownOption[]`).

### D.5 Not migrated this pass

Native `<select>` left in place in:
- `Search.tsx`
- `Syntheses.tsx`
- `Graph.tsx` (Domain filter + graph-theme picker)
- `ApproveForm.tsx`
- `ConnectionsTab.tsx`
- `ScribeTab.tsx`

These weren't called out as misbehaving. Migrate when they actually surface as a problem — the component is in place to make those swaps mechanical.

---

## Chapter E — Validation card DB fix

### E.1 The bug, in two pieces

**Root cause:** `rag_operations_log` was created in migration 001 with columns `(id, operation, target_id, target_type, details, duration_ms, cost_usd, provider, created_at)`. Two call sites used the wrong column names (`kind`, `payload`) — both have been broken since Session 3 (when the "Run sweep now" feature was added).

| Site | Direction | Pre-Session-7 symptom |
|---|---|---|
| `hive.ts:131` | `SELECT … WHERE kind IN (...)` | `[Hive] validation log query failed: column "kind" does not exist` on every Validation card load |
| `ipc.ts:1522` | `INSERT INTO rag_operations_log (kind, payload, …)` | Silently failing into its `.catch` on every "Run sweep now" click → **zero** `validation_sweep` rows have ever been written |

Symmetric bugs — fixing only the SELECT would leave it returning empty results forever.

### E.2 The fix

- **`hive.ts:131` (SELECT)**: column refs swapped to `operation` + `details`, **aliased back to the legacy names** so `ValidationStats.recentSweeps` shape stays stable. Downstream consumers (`r.kind === 'validation_sweep'` check at line 181 + the Hive Validation card) need no changes:

  ```sql
  SELECT created_at::text AS created_at,
         operation         AS kind,
         details::text     AS payload
    FROM rag_operations_log
   WHERE operation IN ('orphan_sweep', 'deadlink_purge', 'zombie_sweep', 'health_scan', 'validation_sweep')
   ORDER BY created_at DESC
   LIMIT 5
  ```

- **`ipc.ts:1522` (INSERT)**: `(kind, payload, created_at)` → `(operation, details, created_at)`. Values unchanged (`'validation_sweep'` + JSON summary).

### E.3 Historical data note

Because the INSERT has been silently failing for the entire history of the app, the Validation card's recent-sweeps list + sparkline have been blank for every user. Going forward, every "Run sweep now" click records a row, so the sparkline starts populating from the next click. **No backfill is possible** — the rows that would have been written were never written.

### E.4 Other writers are correct

`ragIngest.ts:617` (writes `operation='ingest'`) and `llmClient.ts:111` (writes `operation='query'`) both use the correct column names. Only the validation-sweep pair was broken.

---

## Chapter F — Triage content cap removed

### F.1 Constants gone

`TRIAGE_CONTENT_CAP_URL` (8000) and `TRIAGE_CONTENT_CAP_AUTHORED` (24000) deleted from `foundry.ts`. Their `8 KB / 24 KB` justification was premature defensiveness from a model with much smaller limits — Gemini Flash's 1 M-token window handles full documents trivially.

### F.2 `triagePrompt` simplified

The pre-Session-7 truncation logic (`cap = sourceType === 'url' ? URL : AUTHORED; truncated = content.length > cap ? content.slice(0, cap) + '[…truncated]' : content`) is gone. `truncated` variable kept (now `= content`) so the template-string call site stays unchanged. `sourceType` parameter renamed `_sourceType` — kept in signature for future per-source prompt tweaks (underscore is the unused-but-stable convention).

### F.3 `maxTokens` bumped

| Mode | Was | Now | Reason |
|---|---|---|---|
| extract | 8192 | **16384** | Full document now flows in; cleaned rewrite can be proportionally larger (~5–8 K output tokens + Gemini's thinking budget + JSON wrapper) |
| convert | 1024 | 1024 (unchanged) | Metadata-only output (4 fields); no rewrite needed |

### F.4 Cookie strip retained

`stripCookieBoilerplate()` still runs for URL captures before the prompt (`foundry.ts:574–580`). Cookie walls are pure noise — Firecrawl returns them verbatim, and ~2–3 KB of cookie text at the start of the prompt was occasionally pushing Gemini to classify the BANNER instead of the article. Stripping it pre-prompt is a free win independent of the cap removal.

### F.5 New diagnostic log

`[Foundry/triage] sending N chars to Gemini (mode=<extract|convert>)` — one shot per triage attempt (or twice if the first parse fails and the retry runs). Pairs with the existing `[Foundry/triage] starting for item …` + `[Foundry/triage] item … triaged (…)` logs. Truth source for "what did Gemini actually see" when quality is debugged.

### F.6 Where to put a soft cap if it ever becomes needed

NOT at triage. At capture time — URL / file / paste IPC entry points. Capture-time gating is closer to where the user can correct the input. Triage-time gating obscures what went wrong.

---

## Chapter G — Large-doc 20K-char size warning

### G.1 Threshold + rationale

`LARGE_DOC_CHAR_THRESHOLD = 20_000` chars ≈ 5,000 tokens. Empirically the size band where Gemini Flash's extract-mode cleaning starts showing timeout / truncation risk. Below 20 K, extract works reliably; above 20 K, Convert-only is the safer call.

### G.2 IntakePanel — file panel

- New state: `const [lastFileSize, setLastFileSize] = useState<number | null>(null)`
- Set at the **top** of `handleFile(file)` — before the 5 MB cap check and the ext check — so every drop updates the tracked size (including a smaller-file drop, which hides the warning).
- Inline warning rendered below the file `<ModeToggle>`, gated on `lastFileSize !== null && lastFileSize > LARGE_DOC_CHAR_THRESHOLD && fileMode === 'extract'`.
- **Reactive clear**: flips to Convert → conditional becomes false → warning hides. Drop a smaller file → `lastFileSize` updates → warning hides. No clear-effect needed — the conditional drives it.
- **Persists across capture**: the file is in flight, but the advice ("Convert only is recommended") is forward-looking for the NEXT capture too. Sticky-informational.

### G.3 FoundryItemCard — URL warning

- Gated on `variant === 'pending' && item.sourceType === 'url' && item.triageMode === 'extract' && item.rawContent.length > 20_000`.
- Sits between the tag-chips row and the pending-mode action buttons (Review / Quick Approve / Reject).
- **Static per card** — `triage_mode` is locked into the foundry_items row at capture time.
- **Why `rawContent.length`**: the per-spec ideal is post-cookie-strip length, but that lives transiently in `foundry.ts` between Firecrawl and Gemini. Renderer-accessible options are `rawContent` (pre-strip) and `cleanedContent` (post-Gemini). `rawContent.length` slightly **overstates** the post-strip length, biasing the warning conservatively.
- Only fires on pending cards — admitted/rejected are retrospective with no action to take.

### G.4 Threshold consistency

Same 20,000 in both surfaces — declared as a named const in `IntakePanel.tsx`, inlined as a literal in `FoundryItemCard.tsx`. If you tune the threshold or move it to Settings, the named const is the canonical home.

### G.5 Binary-file quirk

For PDF/DOCX, `file.size` is bytes — much larger than the extracted text length. So the warning may over-trigger on PDFs. Documented in the constants docblock. Acceptable: conservative warning beats silent failure.

---

## Verification at Session 7 partial end

```
npm run db:setup                        → migrations 009 + 010 + 011 applied (unchanged from Session 6)
npm run test                            → 6 files / 28 tests passed (~2.0 s)
npx tsc --noEmit -p tsconfig.web.json   → 6 pre-existing errors, 0 new
npx tsc --noEmit -p tsconfig.node.json  → 4 pre-existing errors, 0 new
```

Net delta in pre-existing tsc errors: **0**.

---

## Files touched in Session 7 partial

### Main process (restart required)

- `src/main/foundry.ts` — Chapter A (References dest), Chapter F (caps removed, maxTokens 16384, new send log)
- `src/main/projectFs.ts` — Chapter A (`addReferencesToThread` + `moveDocumentToThread` destinations)
- `src/main/ragWiki.ts` — Chapter A (`importWikiToThread` destination)
- `src/main/ragIngest.ts` — Chapter B (`stat` import + wikilink-writeback guard block)
- `src/main/hive.ts` — Chapter E (SELECT column rename + alias)
- `src/main/ipc.ts` — Chapter E (INSERT column rename)

### Renderer (hot-reloads)

- `src/renderer/src/components/AnchoredDropdown.tsx` — Chapter D, **new file** ~225 LOC
- `src/renderer/src/components/codex/Wiki.tsx` — Chapter D migration (local `OptionDropdown` deleted ~155 LOC)
- `src/renderer/src/components/codex/Ingest.tsx` — Chapter D migration + `SOURCE_TYPE_OPTIONS` shape change + `TIER_FILTER_OPTIONS` added + `domaineOptions` memoized
- `src/renderer/src/components/foundry/IntakePanel.tsx` — Chapter G (`LARGE_DOC_CHAR_THRESHOLD` const + `lastFileSize` state + inline warning)
- `src/renderer/src/components/foundry/FoundryItemCard.tsx` — Chapter G (URL warning between tags row and actions)
- `src/renderer/src/components/layout/SidebarCell.tsx` — Chapter C (BFS recursion in `handleToggleAction`) + Chapter A (move-modal subtitle copy)
- `src/renderer/src/components/layout/IntakeModal.tsx` — Chapter A UI text
- `src/renderer/src/components/settings/GeneralTab.tsx` — Chapter A UI text
- `src/renderer/src/components/codex/CodexPreview.tsx` — Chapter A UI text (two tooltips)

---

## What Session 7 partial did NOT touch (per scope)

- `themes.ts` / Fey design work — untouched.
- The 10 pre-existing tsc errors — Session 8 still owns them.
- `tsconfig.web.tsbuildinfo` — perpetually-dirty autogen, ignored.
- Migrations 001–011 — no new migrations.
- Honcho, Hermes core logic — Sessions 2, 5 surfaces left alone.
- Graph rendering — Session 6's overhaul is intact.
- Move-to-thread mechanics — Session 6 work preserved, just rerouted destination.
- Existing `References/` folders on disk — never migrated, never renamed, never deleted.
- The four remaining Session 7 items — see known-limits below.

---

## Known limits carried into Session 7 second pass + Session 8

1. **Auto-delete Inbox file after Foundry admission.** Andy's iCloud Drive inbox at `cfg.icloudInboxPath` accumulates files that have been admitted to the Foundry — the original disk file at `~/Library/Mobile Documents/com~apple~CloudDocs/_Agenteryx/Inbox/<filename>` doesn't get cleaned up post-admit. Fix shape: after `foundry.approveItem` succeeds for an item whose `source_type='icloud'` and whose source path is still inside `cfg.icloudInboxPath`, `fs.unlink` the source file. Chokidar's iCloud watcher will see the unlink as a no-op (no rag_documents row at that path; the admitted file is at the thread root).

2. **Domaines navigation state persistence.** Drill-down state (Domaine → Project → Thread) resets to the root list on every tab switch away from Domaines. Pattern to mirror: `ingestStore.selectorDomaineId` / `codexWikiStore.selectorDomaineId` / `graphStore.selectorDomaineId` all persist as `''` defaults but stay across tab switches once the user picks. Storage shape: `domainesStore.viewState: { mode: 'root' | 'domaine' | 'project'; domaineId?; projectName? }` (or `sessionStore` if it should outlive the tab).

3. **Multi-select Domain filter for the graph.** Current `<select>` in `Graph.tsx`'s toolbar is single-select — `(All Domaines)` or one specific Domaine. Session 7 second pass replaces this with a multi-select checkbox list so Andy can filter to "AstraStrata + Dwellium" without falling back to "All". Storage shape: `graphStore.selectorDomaineIds: string[]` (replacing `selectorDomaineId: string`); empty array = "(All Domaines)"; main-side `graphFetch` IPC takes `domaineIds: string[] | null` (null still = all, array is explicit allowlist). **Don't add more single-select Domain filters in the meantime** — the multi-select component built here is the reusable pattern.

4. **Working Memory panel** (architecture-v4 §9). Replace the token counter with the four-pane Working Memory model: active session duration + exchange count, "grounded in" doc list (requires chat-path retrieval instrumentation — confirm whether chat is RAG'd today first), Honcho state at-a-glance, qualitative coherence signal (Fresh / Extended / Long-session-checkpoint). Largest of the four remaining items. See Part 9 + Part 13 §11 of architecture-v4.

5. **`config.gemini` / `config.anthropic` workaround still in 4 places.** `ragIngest.ts:234`, `foundry.ts:480`, `ipc.ts:1478`, `hermes.ts` plain-message handler — same local-assertion workaround pattern. Add `gemini` + `anthropic` to the `HolocronConfig` interface in Session 8 to retire all four in one pass.

6. **`ipc.ts:527` TS2345** drifted again with the Session 7 IPC handlers. Same root cause as before — `path.basename` in `.map(...)`. Session 8 territory.

7. **No tests for `moveDocumentToThread` / `approveItem` / `processIngest` wikilink writeback.** All the Session 6 + Session 7 main-process work is uncovered by the 28-test suite. A filesystem-side test harness (tmp-dir + chokidar mock) would catch resurrection regressions. Session 8 alongside the tsc triage.

8. **AnchoredDropdown not migrated everywhere.** Native `<select>` in Search / Syntheses / Graph / ApproveForm / Connections / ScribeTab. Migrate when each surfaces as a problem, not preemptively.

9. **Move-to-thread is still single-file only.** Multi-select batch move not built. Carries forward from Session 6.

10. **No undo on move-to-thread or delete.** Destructive in the filesystem sense. Same constraint as Delete / Rename. Acceptable for a single-user tool.

11. **20K size warning uses `file.size` (bytes) for IntakePanel, not extracted-text length.** Over-warns on PDF/DOCX (binary overhead). Documented in the IntakePanel constants block. If this becomes annoying, the fix is to defer the warning until extraction completes and `rawContent.length` is known — which means moving it to FoundryItemCard exclusively and dropping it from IntakePanel.

---

## Hand-off (Session 7 partial final)

1. **Read `STATUS.md` first** (refreshed at this sign-off), then `architecture-v4.md` §9 (Working Memory panel) + §11.2 (priority UI improvements) for the Session 7 second-pass items.
2. **`gotcha.md` has four new Session 7 priors at the bottom** under `## Session 7 priors`. Read them before debugging anything related to: extract-mode timeouts, validation card history, dropdown positioning, wikilink writeback.
3. **Don't remove the wikilink-writeback guards.** They look defensive but they're the load-bearing piece that makes Move-to-thread + Delete + References-removal all work without resurrecting files.
4. **Don't migrate the existing `References/` folders.** Forward-only is the locked decision.
5. **Don't backfill validation_sweep rows.** The historical INSERTs all failed; there's nothing to recover. Sparkline starts fresh from the next Run-sweep click.
6. **Don't put a soft cap back on triage content.** If pathological drops become a problem, gate at capture-time, not at triage.
7. **Don't migrate the remaining native `<select>`s preemptively.** `AnchoredDropdown` is ready when each callsite surfaces as a problem.
8. **`npm run dev` restart required after any `src/main/` change.** Session 7 touched six main-process files (foundry, projectFs, ragWiki, ragIngest, hive, ipc).
9. **Don't rename the Honcho workspace.** Still hardcoded at `honcho.ts:1`. (Carry-forward.)
10. **Move-to-thread still bypasses `withRenameLock`.** The wikilink guards added this pass are what make it safe. (Carry-forward + reinforced.)

🍣
