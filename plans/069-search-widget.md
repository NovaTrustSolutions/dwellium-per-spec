# Plan 069: Search widget (`content-search`) — correct matching, honest copy, usable UI, real coverage

> **Executor instructions**: Execute phases in order. Each phase is one ruflo-swarm run
> (ruflo `swarm_init` + `agent_spawn` only REGISTER agents; the work runs as Claude Code
> `Agent` subagents — say so in the report). One worktree off `origin/main`
> (`.claude/worktrees/069-search`, symlink `qualia-shell/node_modules` to the main
> checkout's; `git add` explicit paths only). Frontend only — no backend changes in any phase.
> Full strict gate (repo `CLAUDE.md` → Useful commands) on the FINAL commit of every phase.
> Never push/merge without Ilya's explicit say-so.
>
> **Drift check (run first)**:
> `git diff --stat 8805d96..HEAD -- qualia-shell/src/components/ContentSearch qualia-shell/src/registry/widgetRegistry.ts qualia-shell/src/lib/transcriptSearch.ts qualia-shell/src/components/Notepad/Notepad.tsx qualia-shell/src/context/WindowContext.tsx`

## Status

- **Priority**: P1 (Phase 1), P2 (Phases 2–3)
- **Effort**: S (Phase 1), S–M (Phase 2), M (Phase 3)
- **Planned at**: frontend `8805d96` (main; no drift to `2862c0b`), 2026-09-25
- **Source**: read-only audit. 3 mappers by area (engine / data sources / UI + overlap), then 1
  refute-first reviewer over 15 claims: **14 confirmed, 1 partly refuted** (C11: writing
  `*UserIdHolder.current` in render is the sibling-widget pattern — `DumpMode.tsx:49`,
  `Foundry.tsx:23`, `Wiki.tsx:66`, `Hive.tsx:35`, `Synthesis.tsx:30` — not a Search-specific bug).
  The orchestrator re-ran the snippet and multi-word probes and refuted two agent claims
  (see "Refuted / dropped").

## Execution log

- Phase 1 — `ba0631c` (2026-09-25). Gate green (364 files). Reviewer: 0 defects; orchestrator fixed the registry description (> 100 chars) and a test type error.
- Phase 2 — `e68a296`. Gate green (365). Orchestrator: filter-before-cap, mark contrast (3 themes < 4.5:1). Reviewer: 4 defects + 2 weak tests, all fixed.
- Phase 3 — gate green (367 files, 3304 tests; one run hit a Wiki deep-link timing flake, untouched code, separate task). Orchestrator: stale remote hits, SSR-unsafe init, deep links lost when the target widget is closed (`lib/pendingDeepLink.ts`). Reviewer: focus re-fetch, selection clamp, pending-link TTL, same-tab transcript refresh — all fixed. Found: backend notes have no owner (separate task).

## What the widget is today (capabilities)

| Area | What it does | Where |
|---|---|---|
| Registry | `content-search`, label "Search", tier `labs`, category tools, 640×460 min | `src/registry/widgetRegistry.ts:222-232` |
| Corpus | Builds docs in-memory from 5 per-user One Save stores (Scribe dumps, syntheses, wiki pages, Foundry items, CoPaw memory) + file-tree PATHS from `fetchTree()` | `ContentSearch.tsx:42-66` |
| Engine | Case-insensitive single-substring match; score = 5 if in title + raw body occurrence count; tie-break by title; top 50; snippet = 40 chars before / 60 after first body hit | `searchEngine.ts:28-53` |
| Results | Icon + title + type label + one-line snippet; "N results" / "N indexed" counter | `ContentSearch.tsx:82-119` |
| Open | Fires `qualia-open-widget` with the target widget id; wiki hits also deep-link to the page (pending global + live event, cleared by `Wiki.tsx:104,110`) | `ContentSearch.tsx:69-80` |
| Tests | `src/test/contentSearch.test.ts` — 5 engine unit tests, all green. No render test | |

Stores self-hydrate from localStorage when Search mounts (`createLocalStorageStore.ts:52-53`); their widgets need not have been opened.

## Verified defects

Severity: **H** = wrong/missing results or false claims to the user. **M** = wrong in common cases. **L** = polish.

### A. Engine

| # | Sev | Defect | Evidence |
|---|---|---|---|
| A1 | H | Multi-word queries are one literal substring: "security deposit" returns **0 hits** for "The deposit and the security check" (orchestrator probe) | `searchEngine.ts:35,41-45` |
| A2 | H | Snippet offset is found in `body.toLowerCase()` but sliced from the original body; `toLowerCase` can lengthen text (`İ`→`i̇`). With 100 `İ` before the match the snippet is just `"…"` (orchestrator probe) | `searchEngine.ts:40,43,48` |
| A3 | M | Score = raw occurrence count, no cap/normalization: a doc repeating a word 50× outranks a concise 1-mention doc (engine probe: 50 vs 1) | `searchEngine.ts:46` |
| A4 | M | Hard cap 50 and no total — widget shows "50 results" when 200 match (engine probe) | `searchEngine.ts:52`, `ContentSearch.tsx:88` |
| A5 | L | Title-only hit shows the first 100 body chars as snippet, not the match | `searchEngine.ts:48` |

### B. Honesty / copy

| # | Sev | Defect | Evidence |
|---|---|---|---|
| B1 | H | Empty-state says "Full file-content + semantic search additionally uses the backend index when connected" — nothing in the widget calls any search endpoint (only `StatusCheckModule.tsx:73` POSTs `/api/search/index`) | `ContentSearch.tsx:94` |
| B2 | H | Registry description claims "notes" are searched; Notepad notes are never indexed | `widgetRegistry.ts:225` |
| B3 | M | `fetchTree` failure is swallowed — a broken backend silently shows fewer "indexed" docs, no message | `ContentSearch.tsx:53` |

### C. UI / navigation

| # | Sev | Defect | Evidence |
|---|---|---|---|
| C1 | M | `onMouseLeave` resets row background to literal `#0a0a0a` (base is `var(--bg-desktop)`) → rows stay near-black after hover in every light/latte theme (`variables.css:151,193,235,277,361`) | `ContentSearch.tsx:104-105` |
| C2 | M | Opens via `qualia-open-widget`; the only listener (`Desktop.tsx:686-701`) titles new windows with the raw id + `■` icon (e.g. "file-explorer"), and the ⌘K Resume trail records that raw title (`WindowContext.tsx:312`). `dwellium:open-widget` (`WindowContext.tsx:593-603`) accepts label/icon | `ContentSearch.tsx:69` |
| C3 | M | No keyboard navigation (arrows / Enter / Esc) | `ContentSearch.tsx` (no `onKeyDown`) |
| C4 | M | A11y: input has only a placeholder (no label), results are not a listbox, count is not a live region | `ContentSearch.tsx:86-88,98-116` |
| C5 | L | No match highlighting; no type filter; hardcoded `#222/#666/#1c1c1c` instead of theme tokens | `ContentSearch.tsx:84,88,103,110` |
| C6 | L | File tree fetched once per mount, never refreshed | `ContentSearch.tsx:51-55` |

### D. Coverage

| # | Sev | Gap | Evidence / reusable piece |
|---|---|---|---|
| D1 | H | File CONTENT never searched (paths only). Backend semantic search exists and is permission-filtered: `POST /api/files/search {query, topK}` → `[{fileId, text, similarity}]` | backend `fileRoutes.ts:177-193`, `vectorStore.ts:257-281`; already used by ⌘K `CommandPalette.tsx:760-764,565-584` |
| D2 | H | Notepad notes not searched. `GET /api/files/notes?q=&limit=` exists; Notepad opens a specific note on `qualia-notepad-open-note {noteId,title}` | backend `fileRoutes.ts:234-241`; ⌘K `CommandPalette.tsx:742,1051-1055`; `Notepad.tsx:248-283` |
| D3 | M | Audio transcripts not searched (⌘K has them) | `src/lib/transcriptSearch.ts` (log key `dwellium-transcription-log`); widget id `transcription` |
| D4 | M | Wiki `sources[]` and Foundry `target`/`assessment` not indexed | `wikiStore.ts:21`, `foundryStore.ts:25,27`; `ContentSearch.tsx:61-62` |
| D5 | L | Scribe/Synthesis/Foundry/Hive hits open the widget cold (no per-item deep link exists in those widgets; Scribe's `widgetActions` verbs are create-only) | reviewer C9 |

## Refuted / dropped

- "Retired ids will break Search's opens" (UI mapper) — **refuted**: `openWindow` itself calls `resolveWidgetId` (`WindowContext.tsx:309`).
- Wiki pending global never cleared (reviewer) — **refuted**: `Wiki.tsx:104,110` deletes it.
- Debounce needed (reviewer) — dropped: 2,000 docs incl. a 1 MB body searched in 6.1 ms (engine probe).
- Unbounded recursion on cyclic tree (reviewer) — dropped: the tree is parsed JSON, which cannot be cyclic.

## Module contracts

```ts
// searchEngine.ts
export type SearchDocType = 'file' | 'dump' | 'synthesis' | 'wiki' | 'foundry' | 'memory'
    | 'note' | 'transcript';                      // Phase 3 adds the last two
export interface SearchDoc { id: string; type: SearchDocType; title: string; body: string; widget: string }
export interface SearchHit extends SearchDoc { score: number; snippet: string }
export interface SearchResult { hits: SearchHit[]; total: number }
/** Every whitespace token must appear (title or body), case-insensitive, AND semantics. */
export function searchCorpus(query: string, docs: SearchDoc[], limit?: number): SearchResult;
/** Split `text` into plain/match parts for <mark> rendering (Phase 2). */
export function highlightParts(text: string, query: string): Array<{ text: string; match: boolean }>;
```

## Phases

### Phase 1 — Correctness and honesty (P1) — fixes A1–A5, B1–B3, C1, C2

1. Engine: tokenize on whitespace; a doc matches only if every token is in title or body. Find
   matches with a case-insensitive `u` RegExp over the ORIGINAL string (escaped token), so the
   offset used for the snippet comes from the same string it is sliced from (A2). Score per token
   = `(inTitle ? 5 : 0) + min(occurrences, 3)` (A3). Snippet around the first body match of any
   token; if the match is only in the title, snippet = start of body (unchanged, but no crash).
   Return `{ hits, total }` (A4).
2. Widget: counter shows `N results` or `showing 50 of N`; files-load failure shows a one-line
   "Files unavailable — search covers local content only" note (B3); empty-state copy states
   exactly what is searched (B1).
3. Move row styles to `ContentSearch.css` with theme tokens and `:hover` (C1, part of C5).
4. Open via `dwellium:open-widget` with `label`/`icon` from `getWidgetMeta(widget)` (C2); keep the wiki deep-link.
5. Registry description: list what is actually searched (B2).
6. Tests: multi-word reordered, İ-prefixed snippet non-empty and contains the match, 50× repetition
   does not outrank title match, `total` > `limit`, whitespace query. Mutation-check A1/A2 tests.

### Phase 2 — Usable UI (P2) — fixes C3–C6

1. Keyboard: ↑/↓ moves a selected index, Enter opens, Esc clears the query; selected row
   scrolled into view.
2. A11y: `aria-label` on the input, `role="listbox"` + `role="option"`/`aria-selected`,
   `aria-activedescendant`, count in an `aria-live="polite"` region.
3. `<mark>` highlighting in title and snippet via `highlightParts` (tokens, case-insensitive).
4. Type filter chips (All + one per type present in results) — client-side filter only.
5. Refetch the file tree on window `focus` (C6).
6. First render test for `ContentSearch` (type → results → keyboard open dispatches `dwellium:open-widget`).

### Phase 3 — Coverage via existing endpoints (P2) — fixes D1–D4; D5 documented only

1. Index Wiki `sources` and Foundry `target` + `assessment` (D4).
2. Transcripts: export a `readTranscriptLog()` from `transcriptSearch.ts` (reuse its parser) and
   index each entry (title + speakers + segment text) as type `transcript`, widget `transcription` (D3).
3. Remote results (query ≥ 2 chars, 250 ms debounce, stale-response guard like
   `CommandPalette.tsx:736-800`): `GET /api/files/notes?q=&limit=12` → type `note`, opens
   `notepad` then dispatches `qualia-notepad-open-note {noteId,title}` after the open (D2);
   `POST /api/files/search {query, topK: 8}` → type `file`, title from the chunk's file (fall back
   to "Document"), snippet = chunk text, labelled "content match" (D1). Remote results merge after
   local results; a failure shows the same one-line unavailable note, never blocks local search.
4. Now-true copy: empty state and registry description mention notes, transcripts, file contents.
5. Tests: transcript adapter, remote merge with a mocked fetch (success, failure, stale response).

## Out of scope / not doing

- Backend `/api/search` (ruVector) wiring — ⌘K's `/api/files/search` already covers file content; revisit only if its quality is poor.
- Per-item deep links for Synthesis/Foundry/Hive/Scribe dumps (D5) — needs new listeners in four widgets.
- Delete dead `src/components/StrataDashboard/GlobalSearch.tsx` (only tests import it) — separate task.
- Notepad fetches `${API_BASE}/notes` (no `/api/files` prefix, `Notepad.tsx:139`) and on failure
  shows two hardcoded demo notes (`Notepad.tsx:143-146`), against the no-sample-data rule — separate task.
