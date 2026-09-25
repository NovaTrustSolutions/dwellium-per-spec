# Plan 067: ThoughtWeaver hardening — data safety, per-user isolation, styling, categorizer

> **Executor instructions**: Execute phases in order. Each phase is one ruflo-swarm run
> (ruflo `swarm_init` + `agent_spawn` register agents; the work runs as Claude Code `Agent`
> subagents — say so in the report). One worktree off `origin/main`
> (`.claude/worktrees/067-thoughtweaver`, symlink `qualia-shell/node_modules` to the main
> checkout's; `git add` explicit paths only). Honor every STOP / DECISION gate.
> Never DELETE/TRUNCATE/DROP anything in Supabase or the backend object store (CLAUDE.md).
>
> **Drift check (run first)**:
> `git diff --stat 706233b..HEAD -- qualia-shell/src/components/ThoughtWeaver qualia-shell/src/lib/oneSaveStore.ts qualia-shell/app/routes/capture.tsx`
> and in the backend: `git log --oneline -3 -- src/routes/thoughtWeaverRoutes.ts src/stores/thoughtWeaverStore.ts`

## Status

- **Priority**: P0 (Phase 1–2), P1 (Phase 3), P2 (Phase 4–5)
- **Progress (2026-09-25)**: Phase 1 + Phase 2 DONE on `feat/067-thoughtweaver-phase1` (frontend) and backend `feat/067-thoughtweaver-p2` @ `0dc4646` — not pushed. Phases 3–5 TODO.
- **Effort**: L overall (5 phases, each S–M)
- **Planned at**: frontend `706233b` (main), 2026-09-25
- **Source**: read-only audit — 4 mappers by file ownership + 1 refute-first reviewer
  (9/10 claims confirmed, 1 refuted), then the orchestrator re-read every P0 claim in source.

## What ThoughtWeaver is today (capabilities)

Capture inbox that files each thought into People / Projects / Ideas / Admin / Needs-review.

| Area | What it does | Where |
|---|---|---|
| Capture | Textarea + ⌘/Ctrl+Enter, 4 templates; 3-tier classify: user LLM → backend keyword classifier → local keyword classifier; always persists locally | `ThoughtWeaver.tsx:354-447` |
| Recent list | Merges local + backend + Supabase rows, dedupe by id; re-file (user override, confidence=1), categorize needs-review, delete, "Clear my captures" | `ThoughtWeaver.tsx:490-575, 790-873` |
| Today | To-dos synthesized from captures (admin bucket / action-verb prefix), quick-add, priorities, clear-done | `todoStore.ts`, `insights.ts:191-220` |
| Reports | Daily report, weekly summary, insights (LLM-first, heuristic fallback), auto catch-up on open, → ARA, → Honcho memory | `reportEngine.ts`, `insights.ts`, `thoughtWeaverLinkage.ts` |
| Dashboard / Timeline | Stat cards, bucket filters, date-grouped timeline, derived from local store when backend is absent | `localViews.ts`, `ThoughtWeaver.tsx:1102-1222` |
| Persistence | 3 per-user localStorage stores wrapped by One Save (`thought-weaver`, todo, reports) | `thoughtWeaverStore.ts`, `todoStore.ts`, `reportStore.ts` |
| Phone sync | Write-through push + pull (limit 200) to the user's Supabase `thought_weaver_captures`; phone page `/capture?url=&key=&user=` | `thoughtWeaverSync.ts`, `app/routes/capture.tsx` |
| Consumers | unifiedMemory recall, daily synthesis, Stella tools + "Dream" context, KG corpus, Morning Brief, Drive backup | see integration map in audit |

Tests: 77 targeted vitest tests green (61 logic + 15 persistence + 1 offline capture). None cover the defects below.

## Verified defects

| # | Sev | Defect | Evidence | Failure scenario |
|---|---|---|---|---|
| D1 | **P0 loss** | One Save hydrate replaces the whole capture array (no `merge`); pending write-through lives only in memory; no unload flush | `thoughtWeaverStore.ts:56-63`, `oneSaveStore.ts:126, 376-390` | Capture → reload within 800 ms (or after a failed PUT) with backend up → bootstrap hydrate overwrites local with the stale remote → capture gone. Same for todos/reports. |
| D2 | **P0 guarantee** | Delete never reaches Supabase; deleted capture returns as a non-deletable `backend` row. Re-file never pushed either. | `ThoughtWeaver.tsx:495-533, 536-538`; `thoughtWeaverSync.ts` has no delete/update | User deletes a synced thought → next load it is back, with no delete button. Breaks "only the user deletes — and can". |
| D3 | **P0 security** | Backend `/api/thought-weaver` store is module-level Maps shared by every user; UI renders `/captures`, `/stats`, `/timeline`, `/:table` | backend `stores/thoughtWeaverStore.ts:30-34`, `routes/thoughtWeaverRoutes.ts:21-87` | User A's captured text appears in User B's Recent list/Dashboard; management role can delete A's items. Also lost on restart. |
| D4 | **P0 security** | Supabase scoping is client-side only (anon key); phone page takes key + user_id from the query string | `thoughtWeaverSync.ts:13-16, 78`; `capture.tsx:22-34` | Anyone with the anon key (or a shared `/capture?...` link) can read/write any `user_id`'s rows. |
| D5 | P1 | Header stats ignore local captures once backend stats load | `ThoughtWeaver.tsx:544-546` (`stats ?? deriveStats(local)`) | Counts drop/lie when the backend is reachable. |
| D6 | P1 | Backend bucket delete fires with no confirm | `ThoughtWeaver.tsx:459-464, 1166` | One misclick permanently deletes. |
| D7 | P2 | 43 `tw-*` classes used by the TSX are defined in no stylesheet (CSS has a parallel unused BEM set) | python class diff over all `src/**/*.css` | Recent list, badges, confidence, timeline, empty/offline states render unstyled. |
| D8 | P2 | Categorizer uses raw substring `includes`; any two capitalized words = a person | `localCategorizer.ts:44-66, 98-109, 153` (backend classifier same) | "residue check" → admin; "conceptual art" → idea; "Silver Lake project" → person. Non-English → always needs_review. |
| D9 | P2 | Capture result toast has no `aria-live`; Capture button lacks `aria-busy`; "Sync from captures" result only `console.log` | `ThoughtWeaver.tsx:759-783, 885-894` | Screen-reader users get no result; sync looks like it did nothing. |
| D10 | P3 | Stella "Dream" reads the localStorage key directly; widgetSearch describes TW as an "ideation workspace"; plan 028 marked TODO though shipped; BACKLOG item still "deferred" | `StellaAgent.tsx:1445`, `widgetSearch.ts:55`, `plans/README.md:46`, `BACKLOG.md:65` | Drift, wrong search routing, stale docs. |

Refuted: "LLM tier can double-persist or lose a capture" — `persistLocally` runs once, only after a tier succeeds.
Cross-cutting (out of scope, file a follow-up): D1's in-memory retry queue affects **every** `withSync` store.

## DECISION gates (Ilya)

- **G1 — Backend `/api/thought-weaver` data (D3).** *Recommended:* make `POST /capture` a stateless classifier (return the classification, store nothing) and stop the UI reading `/captures|/stats|/timeline|/:table` — the local store already derives every view. Alternative: key every Map by `req.user.id` (still in-memory, still lost on restart). Either way no stored rows are deleted by an agent.
- **G2 — Phone sync transport (D4).** *Recommended:* retire the Supabase path for new writes and sync phone ↔ desktop through One Save (already per-user, authenticated, cross-device); the phone page logs in instead of carrying a key in the URL. Existing Supabase rows stay untouched and are read once for import (UPSERT into the local store by id). Alternative: keep Supabase and add RLS keyed on a per-user capture token — needs a schema/policy migration Ilya must approve and apply.
- **G3 — Tombstones.** Deleting keeps a `deletedIds` list (id + deletedAt) inside the synced store so merges never resurrect. Confirm this is acceptable (it stores ids, not text).

## Phases (swarm waves by file ownership)

### Phase 1 — Stop data loss (D1, D2, G3) · P0 · M  *(design revised at execution, 2026-09-25)*
The capture array shape is read by ConnectionsPanel, unifiedMemory, dailySynthesis, Drive backup,
Stella and the backend (Morning Brief, KG) — so no shape change. Instead:
- **W1 coder A — `src/lib/oneSaveStore.ts` (root fix for D1, all stores):** `set()` writes a
  persisted dirty marker `onesave:dirty:<objectId>` to localStorage; the flush's `onSaved` for the
  exact entry clears it (a newer queued set keeps it). `hydrate()` (after the seq/owner guards):
  if the marker exists for `objectId()`, do NOT apply remote — `scheduleWriteThrough(local)` and
  return. No new imports (`researchLabImportGuard` pins them; 43 tests mock `oneSaveClient`).
- **W1 coder B — `thoughtWeaverSync.ts` + new `twImportedStore.ts` (D2):** synced id set
  (`withSync('thought-weaver-imported')`, `Record<id, importedAt>`). `importSupabaseCaptures`
  pulls, appends rows whose id is in neither the local captures nor the imported set, then records
  every pulled id. `pushCapture` is retired (G2: no new Supabase writes from the desktop).
- **W2 integrator — `ThoughtWeaver.tsx`:** drop `syncedCaptures`/`pushCapture`; on load (Supabase
  configured) hydrate the imported set, then import. Imported rows are local → deletable/re-fileable.
- **Acceptance** (mutation-checked): stale-remote hydrate after a "reload" keeps an unsaved
  capture; delete an imported capture → next import does not bring it back; StrictMode mount.

### Phase 2 — Per-user isolation (D3, D4, D5) · P0 · M  *(G1/G2 = recommended options, approved 2026-09-25)*
**CONTRACT (shared by all three coders):**
- Backend `POST /api/thought-weaver/capture` `{ text }` → `{ success, data: { filed_to, confidence, destination_name, classification } }` — classify only, store NOTHING. 400 if empty, 413 if text > 20 000 chars.
- Backend `POST /api/thought-weaver/inbox` `{ text }` → classifies server-side and appends
  `InboxItem = { id: string; text: string; filed_to: string; confidence: number; destination_name: string | null; createdAt: string }`
  to One Save object id `thought-weaver-inbox_<req.user.id>`, type `thought-weaver-inbox`, owner = req.user.id,
  payload `{ items: InboxItem[] }` (newest first, capped at the newest 500). Returns `{ success, data: InboxItem }`.
  Auth: same `authenticate` + `requirePermission('widget:thought-weaver')` as the router. Id prefix `inbox-`.
- Removed routes (in-memory, shared across users): `GET /stats|/timeline|/captures|/:table`, `POST /resolve/:id|/seed`, `DELETE /:table/:id`. No stored rows exist to delete (Maps were in memory).
- Desktop reads the inbox with `oneSaveClient.get('thought-weaver-inbox_' + uid)` and imports items once by id through `planImport` + `twImportedStore` (same as Supabase rows). The desktop NEVER writes the inbox object.
- Phone `/capture`: no Supabase; uses the normal Dwellium session (bare `/api/*` fetch → `installApiAuthFetch` adds the Bearer). Not signed in / 401 → "Sign in to Dwellium on this phone first" + link to `/`. Legacy `?url=&key=&user=` params are stripped with `history.replaceState` and never stored; the legacy `tw-capture-config` localStorage entry (a config holding the anon key, not user content) is removed.
- Supabase stays READ-only for a one-time import of existing rows (Phase 1); no code writes or deletes Supabase rows.

Waves: W1 = backend coder (backend worktree `~/dwellium-backend/worktrees/067-thoughtweaver`) ∥ widget coder (`ThoughtWeaver.tsx`, new `twInbox.ts`) ∥ phone coder (`app/routes/capture.tsx`). W2 = orchestrator read + full gates. D5: header stats come from `deriveStats(localCaptures)` only.
- **Acceptance**: backend supertest — user A's inbox never readable/writable as B; removed routes 404; 413 on oversize; `/capture` leaves no state. Frontend — no request URL contains `key=`; phone capture shows sign-in on 401; desktop imports an inbox item once and a deleted one stays deleted.

### Phase 3 — Safety UX (D6, D9) · P1 · S
- Confirm on backend delete (reuse the `window.confirm` pattern at `:571`); `aria-live="polite"` on the result toast, `aria-busy` on Capture; toast for "Sync from captures (N added)".

### Phase 4 — Styling (D7) · P2 · M
- Single owner: `ThoughtWeaver.css`. Map the 43 orphaned classes onto the existing unused BEM rules (rename in CSS, not TSX, to keep the diff in one file); delete CSS rules nothing renders; theme tokens only (`grep -rn -- '--name:' src/styles` before using any); container query for narrow windows.
- **Acceptance**: harness before/after (`dwellium-standalone-widget-harness`), cosmos + latte (seed `dwellium-theme` via `addInitScript` and assert luminance), axe 0 serious; re-run the class-diff script → 0 orphans.

### Phase 5 — Categorizer + drift (D8, D10) · P2/P3 · S
- `localCategorizer.ts` + backend classifier: word-boundary regex (`\b…\b`, escaped); `detectName` requires a social cue or rejects when followed by project/street/lake-style nouns; non-Latin text gets an explicit "heuristic is English-only" label. Balanced-bracket `parseJsonLoose`.
- Stella Dream → `thoughtWeaverStore.getSnapshot()`; fix `widgetSearch.ts` description; mark plan 028 DONE-superseded, close BACKLOG item, note in `docs/code.md`.
- **Acceptance**: table-driven tests for every false positive above.

### Final wave — adversarial review (3 lenses: data-safety, security, UI honesty)
Each finding → refute-first verifier → orchestrator re-reads. Then FULL gate on the final commit:
`cd qualia-shell && npx tsc --noEmit && npx vitest run` and backend `npm test`. `grep -rn "vi.mock('.*oneSaveStore" src` after Phase 1 (new exports break hand-written mocks).

## Out of scope / follow-ups
- One Save in-memory retry queue for all other stores (cross-cutting; Phase 1 fixes it generically only if the STOP gate doesn't trip).
- Embedding/LLM categorization at capture time beyond today's LLM-first tier.
- No push/merge/deploy without Ilya's explicit go.
