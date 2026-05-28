# Handoff v07 — Phase 3b Step 11 (Wiki sub-tab UI)

**To:** the next Claude session
**From:** prior session 2026-05-08 (shipped step 10 wiki compilation, fixed the watcher-clobber bug that was blocking smoke testing, verified end-to-end: 6 wiki pages in DB + on disk, auto-compile fires after 5 ingests, wiki re-ingestion loop closes correctly)
**You are starting:** **Step 11 — Library preview surface + Wiki sub-tab.** Then **Step 11.5** ports Search clicks onto the same surface. Both are pure renderer work plus 2-3 small IPCs; the wiki:* IPCs are already wired.

**Heads-up: open chat investigation in flight (commit `d15416e`).** Diagnostic `[ChatDiag]` logs were added 2026-05-08 at four points along the chat request path — `threadActions.ts`, `useLMStream.ts`, `ipc.ts` (`lm:start` handler), `honcho.ts` (`getMessages`). They are pure `console.log` additions with no behavior change. **Do not remove them**, do not reformat the lines they sit on, and avoid touching those four files in your Step 11 work. If your changes do legitimately need to touch them, preserve the `[ChatDiag]` lines verbatim — Andy is waiting for a log capture from a real recurrence to diagnose a hallucination/context-bleed bug. Investigation status is in `STATUS.md`; full report is in `d15416e`'s commit message.

**Scope decision (2026-05-08):** the original step 11 was just "Wiki sub-tab grid + readable view." After a UX design pass with Andy we expanded to a preview-surface architecture: clicking any non-active-thread RAG doc opens an in-Library preview, never auto-opens in Editor. Wiki + synthesis pages get Import-to-Thread / Use-as-Report-Draft actions and are NEVER editable in place; cross-thread references get an Edit toggle with disclosure. The decision is captured in `architecture-v3.md` §"Read/Write Surface Split". Read that section before designing components.

**Naming convention:** handoffs live in `docs/` as `HANDOFF_vNN_step-X.md`, monotonic counter. Predecessors: `v01_step-4.md`, `v02_step-5.md`, `v03_step-3.md`, `v04_step-7.md`, `v05_step-6.md`, `v06_step-10.md`. When you finish, write `HANDOFF_v08_step-X.md` for whatever comes next.

---

## Read order (~15 min)

1. **`docs/STATUS.md`** — current project state. Phase 3a complete; 3b step 10 shipped.
2. **`docs/architecture-v3.md` §"Read/Write Surface Split"** — the architectural decision driving this step. Includes the dispatch table, the `useFileRelationship` hook contract, and the Search-result badges. Don't relitigate; it's settled.
3. **`docs/architecture-v3.md` §"Library tab"** — names the 5 sub-tabs.
4. **`docs/gotcha.md`** — debugging discipline + accumulated priors. The chokidar+watcher entries are critical priors; do not relitigate them.
5. **`editor/src/renderer/src/components/library/Search.tsx`** — structural template + the click handler you'll modify in step 11.5. Uses `libraryStore.ts` for tab-switch persistence; your Wiki state should follow that pattern.
6. **`editor/src/renderer/src/components/library/LibraryTab.tsx`** — the sub-tab strip you're flipping the Wiki tab from disabled to active.
7. **`editor/src/main/ragWiki.ts`** — the backend you're calling for wiki content. Skim the public exports (`listWikiPages`, `getWikiPage`, `regenerateWikiPage`, `compileNow`).
8. **`editor/src/main/report.ts`** — for "Use as Report Draft" — version-aware report writing already exists, call into it.

---

## What's already done (Phase 3b progress)

| Step | Commit(s) | Status |
|---|---|---|
| 10 Wiki compilation pipeline | `00819b9` | ✓ verified — 6 pages in DB + disk, auto-compile, re-ingest loop |
| Reference regex + right-click Re-ingest | `d1f07da` | ✓ verified |
| Watcher: usePolling + awaitWriteFinish + depth | `779e947`, `16440b4` | ✓ verified |
| Watcher: stop thread switches from clobbering root | `2399f6e` | ✓ **the actual proximate cause** of the missed-events behavior |

The watcher saga is closed. There's exactly one chokidar instance (the root watcher on `_Projects/`); thread switches no longer touch it. Polling at 1s is the settled config. Don't relitigate.

---

## Your job — Step 11 + Step 11.5 (Option C)

Two ships. Step 11 builds the surface; Step 11.5 migrates Search onto it. The split keeps each commit small and lets you verify wiki rendering in isolation before changing Search behavior.

### Step 11: LibraryPreview component + Wiki sub-tab

**Files to add:**

- `editor/src/renderer/src/components/library/LibraryPreview.tsx` *(new, the substance)* — the shared preview surface. Props: `{ document: PreviewDoc, mode: 'wiki' | 'cross-thread' | 'active-thread' | 'synthesis' | 'inbox', onClose?: () => void }`. Renders:
  - A header with title, metadata (source path + project/thread + updated_at), and a mode-appropriate action toolbar:
    - `wiki` / `synthesis` → **Import to Thread**, **Use as Report Draft**, **Regenerate** (wiki only)
    - `cross-thread` → **Edit** toggle (read ↔ write), with a disclosure pill: "From {project} / {thread}"
    - `active-thread` → just **Open in Editor** (in case the user reached the preview from somewhere other than Search; main path is Search→Editor in step 11.5)
  - A body that renders markdown content (read-only by default; if cross-thread + Edit toggled, swap in a CodeMirror-with-markdown writer instance)
- `editor/src/renderer/src/components/library/Wiki.tsx` *(new)* — Wiki sub-tab. Grid mode (default) of cards (title, source_count, humanized updated_at) + click-into reading mode that delegates to `<LibraryPreview document={…} mode="wiki" onClose={backToGrid} />`. Empty state with "Compile now" button calling `wikiCompileNow()`.
- `editor/src/renderer/src/store/libraryWikiStore.ts` *(new)* — zustand store mirroring `libraryStore.ts`. Holds: `pages: WikiPageListItem[]`, `selectedSlug: string | null`, `selectedPage: WikiPageRow | null`, `loading`, `error`. Tab-switch persistence rule from Search applies: returning to Wiki must NOT clear state.

**Files to modify:**

- `editor/src/renderer/src/components/library/LibraryTab.tsx` — flip the Wiki sub-tab from `enabled: false` to `enabled: true`, route to `<Wiki />` when active.

**New IPCs (main side):**

- `editor/src/main/ragWiki.ts` extension — two new exports:
  - `importWikiToThread(slug, project, thread): Promise<{ ok, destPath?, error? }>` — copies `_Library/Wiki/<slug>.md` to `<projectsRoot>/<project>/<thread>/References/<slug>.md`. mkdir -p the References folder. Overwrite policy v1: confirm-then-overwrite (renderer-side confirmation; backend just writes). Triggers chokidar 'add' on the new file, which auto-ingests it as `source_type='reference'`. Result lists destPath so the renderer can show "Imported to {destPath}".
  - `useWikiAsReportDraft(slug, project, thread): Promise<{ ok, destPath?, error? }>` — calls into `report.ts` versioning logic to get the next `Reports/<slug>_v1.md` (or `_v2.md` etc.) and writes wiki content there. Don't roll your own naming — the existing `report.ts` already handles versioning.
- `editor/src/main/ipc.ts` — `wiki:import-to-thread`, `wiki:use-as-report-draft` handlers.
- `editor/src/preload/index.ts` + `editor/src/renderer/src/types/ipc.ts` — bindings + types.

**IPCs already wired from step 10 (no work needed):**

- `window.electronAPI.wikiList()` → `{ ok, data?, error? }`
- `window.electronAPI.wikiGet(slug)` → `{ ok, data?, error? }`
- `window.electronAPI.wikiRegenerate(slug)` → `{ ok, slug, content?, error? }`
- `window.electronAPI.wikiCompileNow()` → `{ ok, data?, error? }`

### Step 11.5: Reroute Search clicks onto LibraryPreview

**Files to add:**

- `editor/src/renderer/src/hooks/useFileRelationship.ts` *(new)* — the canonical dispatch hook. Takes a `SearchResult` (or any `RagDocument`-shaped object) plus `cfg.activeProjectName` + `cfg.activeThreadName` from `useSettingsStore`, returns one of `'active' | 'cross-thread' | 'wiki' | 'synthesis' | 'inbox'`. ~30 LOC including the `source_type` switch and the active-thread comparison. Both Search and Wiki consume it.

**Files to modify:**

- `editor/src/renderer/src/components/library/Search.tsx`:
  - Replace the existing `openResult` (which currently calls `readFile` + `editorStore.openFileWithContent` + `setActiveTab('editor')`) with a relationship-aware dispatch:
    - `'active'` → existing Editor open path (unchanged)
    - any other relationship → set `previewDoc` in `libraryStore` and render `<LibraryPreview>` overlay/replace within the Search sub-tab
  - Add a small badge per result card: ✎ Open / 📖 Preview / ↗ Preview (other thread). Computed from `useFileRelationship(result)`.
  - Editor-tab dedup: if the file is already in `editorStore.openFiles`, switch to Editor + select that tab regardless of relationship. Avoids "two surfaces showing the same file" confusion.
- `editor/src/renderer/src/store/libraryStore.ts` — extend with `previewDoc: PreviewDoc | null` so Search can show the preview without a route change.

**Action toolbar implementation reuses Step 11's `LibraryPreview`** — that's the whole point of Option C. Step 11.5 just wires the click.

### Markdown rendering — open question to resolve

The wiki page content is structured Markdown (`# Title`, `## Overview`, `## Key concepts`, `## Open questions`, `## Sources` with `[N]` citation markers). Three options for rendering:

1. **`react-markdown`** (recommended starting point). Add as a dep, configure with `remark-gfm` if needed. Clean, well-maintained, ~30kb gzipped. Andy is comfortable with new deps when justified.
2. **CodeMirror 6 read-only with markdown extension.** Reuses the existing editor extensions. Looks heavier, but consistent with the editor's visual language.
3. **A minimal hand-rolled renderer.** ~80 LOC. Handles `#`/`##`/lists/bold/italic/`[N]` markers and nothing else. Brittle for future content but ships zero deps.

**Recommendation:** start with `react-markdown` — it's standard, the wiki content is small, and we'll need it again for syntheses in Phase 3c. Defensible to defer to next session if the dep adds friction.

### UX detail decisions to make / settle

- **Grid layout:** CSS `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))` with 12px gaps mirrors common knowledge-base UIs. Each card ~120px tall.
- **Empty state** (no wiki pages yet): copy like *"No wiki pages compiled yet. Pages auto-compile after every 5 ingests. Or click 'Compile now' to bootstrap from existing tags."* Plus a "Compile now" button that calls `wikiCompileNow()`.
- **Updated_at humanization:** "5 min ago" / "2 hr ago" / "yesterday" / "May 6". Defer a date library; a small helper (~15 LOC) is enough.
- **Regenerate button feedback:** disable during the call, show inline "Compiling…" spinner. On success: refetch `wikiGet(slug)` to update the reading view content + updated_at. On error: surface inline.
- **Reading mode source markers:** `[1]`, `[2]` in the body should be visually subtle (small superscript or a colored span). The Sources section lists them. No interactive linking in v1 — just visual cues.

### Persistence across tab switches (mirror Search.tsx pattern)

Same UX bug we hit in step 7: leaving the Wiki sub-tab and coming back must NOT clear state. The store holds `selectedSlug`, the loaded `selectedPage`, and `pages`. On mount: if the store already has data and `selectedSlug` is set, render reading mode without refetching. Refresh button (manual) for explicit reload. Auto-refresh on first mount only (when `pages` is empty).

### Definition of done

**Step 11:**
- Wiki sub-tab in Library tab is active (no longer disabled).
- Grid view shows all `rag_wiki_pages` rows with title, source count, last-updated.
- Click a card → `LibraryPreview` mounts in `mode='wiki'` and renders the markdown.
- "Regenerate" toolbar button calls `wikiRegenerate(slug)` and refreshes content.
- "Import to Thread" copies the wiki to `<active thread>/References/<slug>.md`. Subsequent chokidar fire auto-ingests it as `source_type='reference'`. Renderer alerts the destPath. Behaves correctly when no active thread is set (button disabled with tooltip).
- "Use as Report Draft" calls into the existing `report.ts` versioning to write `<active thread>/Reports/<slug>_v1.md` (or v2/v3 if a prior import exists).
- Empty state shows when zero pages exist; "Compile now" button works.
- Tab-switch persistence: leave Wiki, go to Search, come back — last selected page is still rendered without refetch.
- `tsc --noEmit` clean; `npm run build` clean.

**Step 11.5:**
- Search result cards show a badge per `useFileRelationship` outcome (✎ / 📖 / ↗).
- Active-thread Search clicks still open in Editor (existing behavior preserved).
- Cross-thread / wiki / synthesis Search clicks render `LibraryPreview` inside the Search sub-tab area instead of switching to Editor.
- If clicked file is already in `editorStore.openFiles`, switch to Editor regardless of relationship (dedup).
- Cross-thread reference preview's Edit toggle: read mode default; toggle on → CodeMirror writer; saves to original path; toolbar shows source thread.
- `tsc --noEmit` clean; `npm run build` clean.

### Smoke verification suggestion

**Step 11:**
1. Click Library → Wiki sub-tab → grid renders 6 cards.
2. Click a card → `LibraryPreview` shows compiled markdown with the four sections.
3. Click "Regenerate" → spinner → fresh content + new updated_at.
4. Click "Import to Thread" → alert shows destPath like `…/References/<slug>.md`; check `rag_documents WHERE source_type='reference'` for a new row within ~1-2s.
5. Click "Use as Report Draft" → alert shows `Reports/<slug>_v1.md`; check disk + `rag_documents` for the report row.
6. Switch to Search → switch back to Wiki → preview is still on the same page; no re-fetch network call.

**Step 11.5:**
1. In Search, type a query that matches across thread boundaries → results show ✎/📖/↗ badges according to relationship.
2. Click an active-thread result → Editor opens (existing behavior).
3. Click a cross-thread result → preview opens in Library with disclosure toolbar.
4. Click a wiki result → preview opens in Library with Import / Use-as-Report buttons.
5. Open a file in Editor (via Sidebar) → run a Search that hits it → click → switches to Editor (dedup), no preview opened.

---

## Things settled — DO NOT re-design these

1. **Library tab is the canonical READ surface; Editor tab is the canonical WRITE surface for the active thread.** Captured in `architecture-v3.md` §"Read/Write Surface Split". This is the architecture; don't propose alternatives.
2. **Wiki pages are NEVER editable in place.** The compounding loop overwrites them on recompile. Import-to-Thread is the workflow for working with wiki content. Same rule will apply to syntheses in Phase 3c.
3. **Cross-thread references ARE editable in place** with a disclosure toolbar showing the source project/thread. The owning thread is unambiguous from the file path.
4. **`useFileRelationship(doc)` is the SINGLE source of truth for dispatch.** Don't duplicate the active-thread comparison or the source_type switch across components. Every divergence is a future bug.
5. **`useAsReportDraft` calls into existing `report.ts` versioning.** Don't roll your own filename logic — the `_v1`/`_v2`/`_v3` semantics are already correct there.
6. **No tag-filter or project-filter** on the wiki list in v1. Just chronological by `updated_at DESC`.
7. **Library tab is full-width, no sidebar/chat.** Same pattern as Dashboard and Projects.
8. **`wiki:compile-now` ignores the 5-ingest counter** but respects the `isCompiling` lock. UI button calls it; no extra IPC plumbing.
9. **Sub-tab routing lives in `LibraryTab.tsx`'s local state.** Not in zustand. Per-sub-tab content state goes in libraryStore / libraryWikiStore.
10. **Alert() for v1 feedback** until a real toast component exists. Pattern is established by the right-click Re-ingest path (`d1f07da`). Toast is future cleanup.

---

## Gotchas that matter for this step

- **Chokidar must use `usePolling: true` on macOS.** Settled. Don't touch the watcher config.
- **There is exactly ONE workspace watcher** — `startWatcher` closes the existing one before opening a new one. Thread switching MUST NOT call `startWatcher`. Don't add new call sites; don't second-guess the rule.
- **Stale preload after preload changes.** You shouldn't need to touch `src/preload/index.ts` for step 11 (all IPCs already exist). If you do touch it, restart `npm run dev` + Cmd+Shift+R the renderer.
- **Gemini 2.5 Flash thinking-mode tokens count against `max_tokens`.** Step 10's `wiki-compile` task uses 4096; if you add a new compile-style task, budget ≥1024 even for tiny outputs. See `docs/code.md`.
- **Reading the wiki source path back through chokidar:** wiki page disk artifacts under `_Library/Wiki/` are deliberately excluded by `onFileEvent` in `ragIngest.ts`. The renderer can show their paths; just don't write any UI that triggers a `chokidar`-style "watch this file" expectation.

---

## Confirmed running infrastructure

```
Postgres   localhost:5432   pgvector/pgvector:pg15   container holocron_link-database-1
Redis      localhost:6379   redis:8.2                container holocron_link-redis-1
Honcho     localhost:8000   custom build             containers holocron_link-api-1 + deriver-1
```

`HOLOCRON_DB_URI` is in `editor/.env`. `npm run db:setup` is idempotent and applies all `editor/scripts/migrations/*.sql` in lex order. Migration 003 (rag_wiki_page_sources) already applied.

Andy's current data state (verify with `SELECT COUNT(*) FROM rag_wiki_pages` before claiming any UI rendering is correct):

- 6 wiki pages in `rag_wiki_pages`
- 6 markdown files under `_Library/Wiki/<slug>.md`
- Each page has rows in `rag_wiki_page_sources` linking to its source documents

---

## Open questions you might hit

- **"Should the grid show snippets / first paragraph of each page?"** Optional v1.5. For v1, title + source_count + updated_at is enough.
- **"Two-pane layout (list left, content right) instead of grid → reading-mode toggle?"** Either is defensible. Grid + back-arrow is simpler for v1; two-pane is a v1.5 enhancement if Andy asks. Don't preempt.
- **"Markdown renderer dep choice?"** See "Markdown rendering" section above. `react-markdown` is the recommended pick.
- **"Should clicking a `[N]` citation marker scroll to the Sources section?"** v1.5. v1: no interaction.
- **"What if `wikiRegenerate` returns success but the content didn't actually change?"** Just refresh and let the user see the same content. The Gemini call might have been near-deterministic on the same source set.
- **"Should the empty state show 'Compile now' even if Gemini API key is missing?"** Yes — the IPC will surface the error and the renderer can show "Configure Gemini key in Settings → Connections." Don't preempt by hiding the button.
- **"Should I open wiki page disk file in Editor on click?"** No — Wiki sub-tab is for read-only viewing. Editor would let the user edit, breaking the "agent-written, read-only" rule. Click → reading mode within the Library tab.

---

## What's next after step 11 + 11.5

- **Step 12** (Wikilink-as-edge insertion): extends `ragIngest.ts` to scan ingested doc content against `rag_wiki_pages.title`, insert `[[wikilinks]]` in place, write the modified content back to disk, log relationships in `rag_relationships` with `discovered_by='agent'`. Depends on having wiki pages (now exist). Smallish — ~80 LOC.
- **Step 14** (Cmd+K wikilink picker): editor keymap binding opens a fuzzy-search overlay across wiki page titles. Insert `[[Title]]` at cursor. ~50 LOC for the overlay + an editor extension.
- **Step 16** (Pending Actions on Dashboard): the sidebar right-click was already shipped; remaining is the dashboard widget showing queue depth.
- **Step 17** (Telegram Inbox): independent; needs Cloudflare Worker deployment + a small chokidar special-case for `_Inbox/Inbox.md`.
- **Step 15** (per-tab agent chat sidebar in Library): independent UI.

After Phase 3b → Phase 3c (synthesis essays via Sonnet, Mind tab, Cytoscape graph). Spec in `architecture-v3.md` §"Implementation phases — Phase 3c." Note: `LibraryPreview` from this step will need to extend to `mode='synthesis'` in Phase 3c; that's a small addition since the toolbar shape is already established.

---

**Current branch:** `main`. **Latest commit:** `2399f6e` (watcher-clobber fix). **Step 10 commit:** `00819b9`. Run `git log -10` for the recent trail.

**You're cleared to begin step 11 immediately.** Good luck.
