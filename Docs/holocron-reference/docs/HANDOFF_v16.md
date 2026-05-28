# Handoff v16 — Architecture-v4 Session 4 (Foundry foundation)

**To:** the next Claude session
**From:** Session 4, 2026-05-14. Five parts in one long session:
  - **Part A** — Foundry foundation: `foundry_items` table (migration 009), the Foundry top-level tab + intake stubs, Triage Agent (Gemini Flash) with JSON output, Review Queue with three sections (Pending / Admitted / Rejected), Approve / Edit-then-Approve / Reject + thread assignment, admission via chokidar pickup into the existing ingestion pipeline, Hive Foundry card.
  - **Part B** — Cleaned content (mid-session): migration 010 adds `cleaned_content`, the Triage Agent prompt gains a `cleaned_content` field (cookie banners / nav menus / ads / image markdown / Related Articles / etc. stripped), `maxTokens` 1024 → 8192 so multi-KB articles fit, per-source content caps (URL 8 KB / paste 24 KB), pre-prompt cookie-boilerplate stripper, filename cap 60 chars. UI: cleaned/original toggle on cards.
  - **Part C** — UX redesign: compact queue cards (no inline preview, no inline edit textarea), **full-width `ReviewPanel`** with proper markdown rendering (new `MarkdownView` wrapper around `ReactMarkdown`), `ApproveForm` always shown — even for Quick Approve from the queue (filename + thread dropdown), `AdmittedConfirmation` success card with **"Open in Codex"** deep link (sets Ingest filter → switches Codex sub-tab → activates Codex tab), Restore + per-row Delete on rejected items, "Clear all rejected" bulk action.
  - **Part D** — Diagnostics + dev-mode fix: triage entry-point `[Foundry/triage] starting for item …` log so terminal/DevTools console confusion stops eating debugging time. Promoted `dreamFiredThisLaunch` to a `window`-attached singleton so Vite HMR no longer resets the dedup set on file save.
  - **Part E** — Intake row redesign + modes: migration 011 adds `triage_mode` with CHECK constraint (`extract` | `convert`). **Three-panel intake row** (URL · File · Paste, equal-height cards). **Extract signal / Convert only toggle** on URL + File panels — paste is always convert. **File drop zone** for .txt / .md (PDF/DOCX coming Session 5). "Clear all admitted" symmetric with the rejected bulk action. Mode-aware triage prompt + per-mode `maxTokens` (1024 for convert, 8192 for extract).
**You are starting:** the MVP + v13 + v14 + Session 2 + Session 3 + Session 4 baseline is intact. **Architecture-v4 Session 4 is complete.** Andy can paste a URL or text, or drop a file, choose extract-signal vs convert-only, watch the Triage Agent classify + (optionally) clean, review the cleaned markdown like a document in a full-width panel, approve with an inline filename + thread prompt, and watch the success card surface with a one-click "Open in Codex" deep link. **Session 5 (Hermes + PDF/DOCX extraction warm-up)** is the next planned chapter — see `architecture-v4.md` §12.

---

## 🛑 READ FIRST — verification rules (unchanged)

`npx tsc --noEmit -p tsconfig.web.json` for renderer changes. `npm run typecheck`'s `&&` still short-circuits on the node-side pre-existing errors; check the renderer alone with the explicit per-project invocation. Main-process changes need a full `npm run dev` cycle; renderer hot-reloads. `npm run test` = 28 vitest tests against the real test Postgres. **Still 28/28 at session end.** Zero new tsc errors introduced.

### Pre-existing tsc errors (unchanged — Session 8 triage still)

| File | Line(s) | Code | Note |
|---|---|---|---|
| `src/main/cleanupOps.ts` | 517 | TS2322 | `withRagClient` returns `number\|null` |
| `src/main/convert.ts` | 20, 29 | TS2339 | mammoth + pdf-parse runtime quirks |
| `src/main/dashboard.ts` | 54 | TS18047 | `res.rowCount` nullable |
| `src/main/ipc.ts` | 519 | TS2345 | `path.basename` in `.map(...)` — drifted from 304 (v14) → 466 (Sess 2) → 504 (Sess 3) → 519 (Sess 4) as Foundry IPCs were added above |
| `src/main/ragIngest.ts` | 234 | TS2339 | `config.gemini` not on `HolocronConfig` — now also hits `foundry.ts:347` via the same workaround pattern |
| `src/renderer/src/components/chat/ChatMessage.tsx` | 67 | TS2353 + TS7031 | react-markdown component override |
| `src/renderer/src/components/codex/CodexPreview.tsx` | 1419, 1518 | TS2345 + TS2352 | ScribeColorTheme + ReactPortal |
| `src/renderer/src/components/hud/HUD.tsx` | 50 | TS2367 | `'dashboard'` literal vs `AppTab` |
| `src/renderer/src/components/scribe/selectionObserver.ts` | 14 | TS2344 | PluginValue |

Filter typecheck output for files YOU touch. Don't fix the above unless explicitly tasked — Session 8 in `architecture-v4.md` §12 is the dedicated triage pass.

---

## Read order (~25 min)

1. **`docs/STATUS.md`** — refreshed at Session 4 end (points at Session 5 next).
2. **This file** (HANDOFF_v16) — the Session 4 chapter.
3. **`docs/architecture-v4.md`** §12 — Session 5 (Hermes) is what's next; §4.5 + §6 + §10 are the spec.
4. **`docs/gotcha.md`** — Session 4 priors block at the bottom has four new entries before "Architecture priors".
5. **`docs/HANDOFF_v15.md`** Session 3 chapter — context for what Session 3 left open that Session 4 absorbed (synthesis source_type fix; synthesis_type='honcho-dream' parameterization).

---

## Decisions locked at session start (do not relitigate)

- **`foundry_items` separate table** (architecture-v4 Part 13 §4 recommendation) over a `staging` flag on `rag_documents`. The lifecycle is distinct enough that a join is cleaner than a column explosion on the main table.
- **`source_type='reference'` for admitted Foundry docs** — when chokidar picks up the file written by `approveItem`, the existing `detectSourceType` path-position rules classify it as reference (per the gotcha v13 prior). No new branch needed.
- **Per Part 13 §7 recommendation: `_Codex/References/<slug>.md` for unassigned admissions; thread folder for assigned ones.** Done verbatim.
- **Per Part 13 §6 recommendation: Foundry coexists with direct file-drop into thread folders.** Both ingestion paths still work; Foundry is the front door for external/uncertain content.
- **Status set:** `pending | triaged | approved | rejected` (Andy's tighter set vs. the arch's `captured/triaged/reviewing/admitted/rejected`). `pending` covers the pre-triage state; `triaged` is "Gemini has scored + cleaned, awaiting Andy". Internal grouping in the renderer rolls both into "Pending Review" for the queue UI — same surface, simpler state.
- **`proposed_domain` column name** (US spelling) matches the v14 "Domain" UI-labels rename. `rag_domaines` table keeps the UK spelling (predates the relabel).

---

## Chapter 1 — Part A: Foundry foundation

### 1.1 Migration 009 — `foundry_items` table

`scripts/migrations/009_foundry.sql`. Idempotent. Schema:

```
id, created_at, updated_at, source_type, source_url, source_filename, raw_content,
triage_status (pending|triaged|approved|rejected, CHECK),
proposed_tags TEXT[], proposed_domain TEXT, quality_score REAL,
signal_assessment TEXT, proposed_connections UUID[], triage_completed_at,
reviewed_at, reviewer_notes,
admitted_at, admitted_doc_id UUID REFERENCES rag_documents(id) ON DELETE SET NULL,
target_thread TEXT
```

Production-hardening additions beyond the brief:
- `gen_random_uuid()` default (pgcrypto already loaded by 001).
- `updated_at` auto-touched via a `BEFORE UPDATE` trigger.
- CHECK constraints on `triage_status` and `source_type` (rather than ENUMs — future statuses don't need an `ALTER TYPE`).
- Composite index `(triage_status, created_at DESC)` for the Review queue; partial index on `admitted_doc_id WHERE admitted_doc_id IS NOT NULL` for reverse lookups.
- `proposed_connections UUID[]` reserved column — Session 4 prompt doesn't populate it (the arch §6.3 connections list would come from tag-overlap + tsvector search server-side, not from the LLM). Column shape is settled for the follow-up.

`db-setup.ts` `RAG_TABLES` array updated; runner auto-discovers any `.sql` file in `scripts/migrations/`.

### 1.2 Foundry top-level tab

`AppTab` extended to `'scribe' | 'domaines' | 'codex' | 'foundry' | 'hive' | 'hud'`. `Shell.tsx` adds a `<TabButton>` between Codex and Hive using `IconImport` (intake/refinement metaphor) + a render branch. Default order per arch Part 3: Scribe · Codex · Foundry · Hive · HUD · Domaines.

### 1.3 Backend module — `src/main/foundry.ts`

The brain. ~700 lines by Session 4 end. Exports:
- `captureUrl(url, triageMode='extract')` — Firecrawl scrape → INSERT `source_type='url'` → fire-and-forget `triageItem`.
- `captureText(content, title, triageMode='convert')` — INSERT `source_type='paste'`.
- `captureFile(content, filename, triageMode='extract')` — INSERT `source_type='file'` (added in Part E).
- `triageItem(id)` — the Gemini Flash agent. Reads content + source_type + triage_mode, builds the prompt, parses the JSON response, UPDATEs the row.
- `approveItem({ id, content, filename, targetThreadPath?, reviewerNotes? })` — sanitizes filename (60-char cap, .md added), writes disk file under `<thread>/References/` or `_Codex/References/`, UPDATEs row to `approved`.
- `rejectItem({ id, notes? })` — UPDATEs `triage_status='rejected'`.
- `restoreRejectedItem(id)` — flips back to `triaged` (or `pending` if no `proposed_tags`).
- `deleteRejectedItem(id)` / `deleteAllRejectedItems()` / `deleteAllAdmittedItems()` — bulk cleanups; refuse to touch non-matching rows.
- `listFoundryItems({ statuses?, limit? })` — newest-first.
- `listTargetThreads()` — flat `(projectName, threadName, threadPath)[]` for the Approve dropdown.

### 1.4 IPC + preload + types

New handlers in `ipc.ts`: `foundry:capture-url`, `foundry:capture-text`, `foundry:capture-file`, `foundry:list`, `foundry:list-target-threads`, `foundry:approve`, `foundry:reject`, `foundry:delete-rejected`, `foundry:delete-all-rejected`, `foundry:delete-all-admitted`, `foundry:restore`. Hive: `hive:foundry-stats`. **Eleven new IPCs total.**

Preload bindings + `types/ipc.ts` signatures mirror exactly.

### 1.5 Renderer: store + components

**`foundryStore.ts`** — items list, threads list, per-item busy sets (`approvingIds`, `rejectingIds`, `restoringIds`, `deletingIds`), `reviewingId` (Review-panel target), `recentlyAdmitted: Map<id, AdmissionSnapshot>` (drives the success card with a 10s auto-hide), `lastActionNote`. Actions: `refresh`, `refreshThreads`, `approve`, `reject`, `restore`, `deleteRejected`, `deleteAllRejected`, `deleteAllAdmitted`, `setReviewingId`, `dismissAdmission`, `clearActionNote`.

**Components in `src/renderer/src/components/foundry/`** (final shape after Parts A–E):
- `Foundry.tsx` — orchestrator (header + IntakePanel + ReviewQueue).
- `IntakePanel.tsx` — three-panel intake row (Part E final).
- `ReviewQueue.tsx` — Pending Review / Admitted / Rejected sections; auto-poll every 3s while pending items exist; replaces itself with `<ReviewPanel/>` when `reviewingId` is set.
- `FoundryItemCard.tsx` — compact queue card (Part C final).
- `ApproveForm.tsx` — reusable filename + thread form (Part C).
- `ReviewPanel.tsx` — full-width markdown view + triage sidebar + action footer (Part C).
- `MarkdownView.tsx` — small `ReactMarkdown` wrapper, no wikilinks/citations, external links → system browser via `window.open` (Part C).
- `AdmittedConfirmation.tsx` — success card with "→ Open in Codex" deep link (Part C).

### 1.6 Hive Foundry card

`src/renderer/src/components/hive/FoundryCard.tsx` — pending count (warning status when > 0), last-captured timestamp (relative), historical totals (admitted / rejected / total), "→ Foundry" deep-link button. Orange accent. Slotted into the Hive grid between SynthesisCard and ValidationCard.

`gatherFoundryStats()` in `hive.ts` — one GROUP BY on `triage_status` + a max(created_at) lookup.

---

## Chapter 2 — Part B: Cleaned content

### 2.1 Migration 010 — `cleaned_content TEXT`

`scripts/migrations/010_foundry_cleaned_content.sql`. Nullable so older rows and paste captures (where cleaning is a no-op) stay NULL gracefully. IDEMPOTENT (`ADD COLUMN IF NOT EXISTS`).

### 2.2 Triage prompt expansion

Added `cleaned_content` to the JSON shape Gemini returns:

> *"rewrite the content keeping ONLY the core article signal. Remove: cookie consent text, navigation menus, advertisements, marketing copy, image markdown (![…](…)), 'Related Articles' sections, email signup forms, cookie policy tables, social-share buttons, comment-section preamble, and any text that is not part of the main article. Preserve: article title, all substantive paragraphs, code blocks, headers, and lists that contain real information. Output clean markdown."*

### 2.3 `maxTokens` + per-source content caps

`maxTokens` bumped **1024 → 8192** for extract mode (a typical 8 KB scrape cleans to 3-6 KB markdown ≈ 1500-3000 output tokens; 8192 leaves headroom for Gemini's thinking-token budget + JSON wrapper).

`triagePrompt` switched to per-source caps:
- `TRIAGE_CONTENT_CAP_URL = 8000` — scrapes are noisy; 8 KB is enough article body to clean usefully.
- `TRIAGE_CONTENT_CAP_AUTHORED = 24000` — paste/file captures are user-authored; generous cap with a sanity ceiling to prevent runaway prompts on pathological inputs.

### 2.4 Cookie-boilerplate stripper

`stripCookieBoilerplate(content)` in `foundry.ts`. Algorithm:
1. Lowercased `lastIndexOf` for each of `['we value your privacy', 'customize consent', 'accept all', 'cookieyes']`.
2. Take max end-position across phrases — anchors after the LAST time any cookie phrase appeared.
3. Find next `\n## ` or `\n# ` heading after that point.
4. Slice from there.
5. Return `{ trimmed, skipped }`.

Gated on `sourceType === 'url'` (paste/file are user-authored, no cookie walls). Fires before the per-source cap slicing. Logs `[Foundry/triage] skipped N chars of boilerplate before first article heading` (terminal-side) when active.

### 2.5 Filename cap to 60 chars

Both `sanitizeFilename` (server) and `deriveFilename` (renderer) capped at **60 chars** of base name (`.md` added after). The previous 80-char UI cap produced filenames that were noisy in the Codex tree.

### 2.6 UI: cleaned/original toggle

On `FoundryItemCard` (before the Part C redesign moved this to `ReviewPanel`): chip + toggle ("CLEANED BY TRIAGE" green / "ORIGINAL" orange) lets Andy compare what got stripped before approving. Preview body, expand-affordance, and "show full (N chars)" all switch with the toggle. Default = cleaned (matches what Approve writes).

### 2.7 Synthesis source_type fix (warm-up earlier in the session)

Predecessor fix that addressed the gotcha v15 prior. `detectSourceType` in `ragIngest.ts` gained a `_Codex/Syntheses/` branch and `'synthesis'` was added to the `SourceType` union + the Codex Ingest dropdown. Hive's gap-bridge generator's `synthesis_type` is now parameterized (`'gap-bridge' | 'honcho-dream'`); the Dreams panel's Approve flow passes `'honcho-dream'` per architecture-v4 §7.5.

---

## Chapter 3 — Part C: UX redesign

### 3.1 Compact queue cards

`FoundryItemCard.tsx` reduced to: source chip + title + triage chip (CLEANED / TRIAGED / PRESERVED / PENDING) + timestamp → quality bar + signal one-liner → tag chips + proposed Domain → three action buttons. **No inline content preview. No inline edit textarea.** Both moved to the full-width Review panel.

### 3.2 ReviewPanel (full-width, replaces the queue area)

`ReviewPanel.tsx`. Two-column body (`minmax(0, 1fr) 260px`):
- LEFT — content rendered as proper markdown via `MarkdownView` (headers, paragraphs, code blocks, lists, external links open in system browser).
- RIGHT — triage sidebar: quality bar, signal assessment, proposed Domain, tag chips.

Header bar: title + source URL (clickable, opens in browser) + "← Back to queue".

Footer bar with three buttons: **Approve this version** / **Edit before approving** / **Reject**. Internal state machine: `read` → `approve` (footer swaps to `ApproveForm`) or `edit` (markdown body swaps to a full-height monospace textarea, then `approve` after edits).

When Andy clicks `[Review]` on a queue card, `setReviewingId(item.id)` flips the state; `ReviewQueue` swaps itself out entirely for `<ReviewPanel item={…}/>`.

### 3.3 ApproveForm — always shown, always inline

`ApproveForm.tsx` extracted from the old FoundryItemCard so it's reusable from both Quick Approve (inside the queue card) and the Review panel's Approve action. Filename input enforces the 60-char cap as the user types + shows a "N chars left" hint near the limit. Thread dropdown defaults to "(None — write to _Codex/References/)" and lists every project/thread flat.

### 3.4 AdmittedConfirmation + deep link

`AdmittedConfirmation.tsx`. Sits at the top of Pending Review for ~10 seconds after a successful Approve. Shows "✓ Admitted → thread X" or "→ _Codex/References/" + the filename + a green **"→ Open in Codex"** button. Deep link:
1. `useIngestStore.setFilter(filename.replace(/\.md$/i, ''))`
2. `useCodexStore.setActiveSubTab('ingest')`
3. `useSessionStore.setActiveTab('codex')`

Andy lands on Codex → Ingest with the new doc filtered to the top of the list.

The 10s auto-hide runs from a `ReviewQueue` `useEffect` that schedules one `setTimeout` per snapshot in `recentlyAdmitted` Map; `dismissAdmission` is idempotent so the timer's no-op delete after manual dismiss is safe.

### 3.5 Restore + Delete on rejected rows

Rejected items get two per-row buttons: **Restore to pending** (flips back to `triaged` or `pending` based on whether `proposed_tags` was already populated, clears `reviewed_at`/`reviewer_notes`) and **Delete** (refuses non-rejected rows). Plus a section-header **Clear all rejected** that wipes the bucket in one shot.

---

## Chapter 4 — Part D: Diagnostics + HMR fix

### 4.1 Triage entry-point log

`triageItem` got `console.log('[Foundry/triage] starting for item', id)` at the very top. The investigation that prompted this turned out to be a DevTools-vs-terminal console confusion (foundry.ts is main-process — gotcha line 19) but the log is worth keeping permanently so the next ambiguous case resolves in one step.

### 4.2 HMR-safe `dreamFiredThisLaunch`

`threadActions.ts`. The module-level `new Set<string>()` was being reset on every Vite HMR file save during dev — which meant every thread switch after a save re-fired the dream. Promoted to a `window`-attached singleton:

```ts
declare global { interface Window { __holocronDreamFired__?: Set<string> } }
const dreamFiredThisLaunch = (window.__holocronDreamFired__ ??= new Set<string>())
```

Identical behavior in production (no HMR); in dev the Set persists across file saves. Only a full `npm run dev` restart resets it.

---

## Chapter 5 — Part E: Intake row redesign + modes

### 5.1 Migration 011 — `triage_mode TEXT NOT NULL DEFAULT 'extract'`

`scripts/migrations/011_foundry_triage_mode.sql`. CHECK constraint pins values to `'extract'` | `'convert'`. IDEMPOTENT (`ADD COLUMN IF NOT EXISTS` + `DO $$` constraint guard).

### 5.2 Two modes by design

- **Extract signal** (default) — Triage Agent classifies AND rewrites body into `cleaned_content`. Approve writes cleaned to disk. Used for websites, scraped articles, anything noisy.
- **Convert only** — Triage Agent classifies but skips the cleaning rewrite. `cleaned_content` stays NULL. Approve writes `raw_content` to disk verbatim. Used for contracts, transcripts, source documents — content Andy already curated and wants preserved.

### 5.3 Mode-aware prompt + maxTokens

`triagePrompt(content, domainNames, sourceType, mode)`:
- Extract mode: full prompt including the `cleaned_content` field.
- Convert mode: same metadata fields (tags, domain, score, signal) but the `cleaned_content` field is omitted from the prompt entirely.

`maxTokens` per mode:
- Extract: **8192** (room for the cleaned rewrite).
- Convert: **1024** (only the 4 metadata fields needed — saves latency + Gemini token spend; typical convert triage lands in 1-2 seconds).

Safety belt: convert-mode UPDATE forces `cleaned_content = NULL` even if Gemini went off-script and returned a value.

### 5.4 Three-panel intake row

`IntakePanel.tsx` rewritten as a three-panel grid (`repeat(auto-fit, minmax(280px, 1fr))`) — stacks at narrow widths:
- **Paste a URL** — URL input + ModeToggle + Capture button.
- **Drop a file** — dashed-border drop zone with upload arrow glyph + "Drop PDF, DOCX, TXT, or MD here" + "or browse" link + accepted-types footer + ModeToggle below.
- **Paste text** — title input + textarea + "Add to Foundry" button. **No ModeToggle** (hard-coded `'convert'`).

`ModeToggle` is a segmented control ("Extract signal" / "Convert only") with a tooltip explaining each.

### 5.5 File drop — TXT/MD support

`.txt` / `.md` → `File.text()` → `foundryCaptureFile(content, filename, fileMode)`. 5 MB cap with size check before reading into memory.

`.pdf` / `.docx` → inline error: "PDF and DOCX support coming soon. Copy the text and use Paste text instead." No capture attempted (binary garbage would poison the row).

Other extensions → "Unsupported file type" message.

Drag-over visual feedback (border + bg tint to cyan when a file is hovering); drop + browse share the same handler; `e.target.value = ''` reset so picking the same file twice still fires.

New backend: `captureFile()` in `foundry.ts`, `foundry:capture-file` IPC, `foundryCaptureFile` preload binding.

### 5.6 "Clear all admitted" symmetric with rejected

Same pattern as Clear all rejected, but with a `window.confirm()` dialog because the user is wiping audit history. Honest copy in the tooltip + the dialog: *"The documents they created in your Codex are NOT affected — this only removes the queue history."*

`deleteAllAdmittedItems()` in `foundry.ts`, `foundry:delete-all-admitted` IPC, `foundryDeleteAllAdmitted` preload binding, `deleteAllAdmitted` store action.

---

## Verification at Session 4 end

```
npm run db:setup                        → migrations 009 + 010 + 011 applied; 11 RAG tables present
npm run test                            → 6 files / 28 tests passed (~2.1 s)
npx tsc --noEmit -p tsconfig.web.json   → 6 pre-existing errors, 0 new
npx tsc --noEmit -p tsconfig.node.json  → 6 pre-existing errors, 0 new (ipc.ts:504 → 519 is line drift from the 11 new Foundry IPCs)
```

No new errors. The pre-existing 11 are unchanged.

---

## Files touched in Session 4

### Migrations (3)
- `scripts/migrations/009_foundry.sql` (new) — foundry_items table + CHECK constraints + updated_at trigger + indexes
- `scripts/migrations/010_foundry_cleaned_content.sql` (new) — cleaned_content TEXT
- `scripts/migrations/011_foundry_triage_mode.sql` (new) — triage_mode TEXT NOT NULL DEFAULT 'extract' + CHECK

### Main process (restart required)
- `scripts/db-setup.ts` — `'foundry_items'` added to `RAG_TABLES`
- `src/main/foundry.ts` (new, ~700 lines by end of session) — capture (URL/text/file), Triage Agent (Gemini Flash, mode-aware), cookie-boilerplate stripper, approve/reject/restore, delete-rejected/delete-all-rejected/delete-all-admitted, list, listTargetThreads, sanitizeFilename, types
- `src/main/hive.ts` — `gatherFoundryStats()` added
- `src/main/ipc.ts` — eleven new handlers: `foundry:capture-url`, `foundry:capture-text`, `foundry:capture-file`, `foundry:list`, `foundry:list-target-threads`, `foundry:approve`, `foundry:reject`, `foundry:delete-rejected`, `foundry:delete-all-rejected`, `foundry:delete-all-admitted`, `foundry:restore`, `hive:foundry-stats`
- `src/main/ragIngest.ts` — `'synthesis'` added to `SourceType`; `_Codex/Syntheses/` branch in `detectSourceType` (warm-up fix earlier in the session)

### Preload + types (restart + Cmd+Shift+R required)
- `src/preload/index.ts` — eleven new bindings
- `src/renderer/src/types/ipc.ts` — matching signatures

### Renderer (hot-reloads)
- `src/renderer/src/store/sessionStore.ts` — `AppTab` union extended with `'foundry'`
- `src/renderer/src/store/foundryStore.ts` (new) — items + threads + busy sets + reviewingId + recentlyAdmitted Map + 10+ actions
- `src/renderer/src/store/hiveStore.ts` — `foundry` data + `refreshFoundry` (folded into `refreshAll`)
- `src/renderer/src/utils/threadActions.ts` — `dreamFiredThisLaunch` promoted to window-attached singleton
- `src/renderer/src/components/layout/Shell.tsx` — Foundry tab button (IconImport) + render branch
- `src/renderer/src/components/foundry/` (new directory):
  - `index.ts` (barrel)
  - `Foundry.tsx` (orchestrator)
  - `IntakePanel.tsx` (three-panel intake row)
  - `ReviewQueue.tsx` (three sections + auto-poll + 10s admission-card timer)
  - `FoundryItemCard.tsx` (compact card; variants pending/admitted/rejected)
  - `ApproveForm.tsx` (reusable filename + thread form)
  - `ReviewPanel.tsx` (full-width markdown view + sidebar + action machine)
  - `MarkdownView.tsx` (ReactMarkdown wrapper)
  - `AdmittedConfirmation.tsx` (success card with Open in Codex)
- `src/renderer/src/components/codex/Ingest.tsx` — `'synthesis'` source-type filter option (warm-up earlier)
- `src/renderer/src/components/hive/FoundryCard.tsx` (new)
- `src/renderer/src/components/hive/Hive.tsx` — FoundryCard added to grid
- `src/renderer/src/components/hive/HonchoCard.tsx` — Approve→synthesis call passes `synthesisType: 'honcho-dream'`

---

## What Session 4 did NOT touch (per scope)

- `themes.ts` / Fey design work — untouched.
- The 11 pre-existing tsc errors — still tabled for Session 8.
- `tsconfig.web.tsbuildinfo` — perpetually-dirty autogen, ignored.
- Hermes / Telegram / iCloud watcher — Session 5.
- Working Memory panel — Session 7.
- Graph visual overhaul (Part 8) — Session 6.

---

## Known limits carried into Session 5+

1. **PDF / DOCX extraction is not wired.** The file drop zone explicitly tells the user "coming soon" for these and refuses the capture. Session 5 should wire `mammoth` (DOCX → markdown) and `pdf-parse` (PDF → text) — both are already deps but produce pre-existing tsc errors (`convert.ts:20,29`) that Session 8 will triage. The cleaner path may be to fix the convert.ts type issues + wire them in Session 5 as the warm-up.

2. **Batch URL capture is not implemented.** Single URL only. A "paste multiple URLs, one per line" path is a natural Session 5+ addition once Hermes brings `/ingest <url1> <url2>` from Telegram.

3. **`admitted_doc_id` is NOT linked synchronously.** Chokidar's debounced (2s) ingest runs after the renderer has moved on, so the column stays NULL even after admission. Future: a periodic backfill sweep matching `rag_documents.source_path` ↔ `foundry_items` rows, or an event emitted from `processIngest` that closes the loop. Functional but the audit trail is incomplete.

4. **`proposed_connections` column exists but Triage doesn't populate it.** Per arch §6.3 connections should come from tag-overlap + tsvector search done server-side before the LLM call, not from Gemini. Reserved column shape is settled; populating it is a follow-up.

5. **Restore-to-pending doesn't auto-re-triage.** If a rejected item is restored AND its status flips to `pending` (because triage hadn't completed before rejection), `triageItem` is NOT auto-fired again. The next manual call or a future "Re-triage" button would re-kick it. Andy hasn't asked for it yet — flagging in case he does.

6. **Triage parse-failure rows stay at `pending` indefinitely.** Two-shot retry inside `triageItem`; if both fail, the row stays at pending with no UI affordance to retry manually. A "Retry triage" button on pending cards would close this if Gemini reliability becomes a measured issue.

7. **iCloud / Telegram source types are reserved in the schema CHECK** but no capture surface exists — Hermes (Session 5) is where they get wired. `file` is already live via the drop zone.

8. **`config.gemini` / `config.anthropic` still not on `HolocronConfig` type.** The local-assertion workaround is now in three places (`ragIngest.ts:234`, `foundry.ts:347`, `ipc.ts:synthesis:generate-gap-bridge`). Worth fixing all three at once in Session 8.

9. **`recentlyAdmitted` is in-memory only** — survives navigation within a session, lost on app restart. After restart the row simply appears in the Admitted (collapsed) section as before. Matches the dream-action-state precedent from gotcha.md Session 3 priors.

10. **`schedule_dream` results still don't auto-surface** (carried over from Session 3). Same trade-off; no change in Session 4.

---

## Hand-off (Session 4 final)

1. **Read `STATUS.md` first** (refreshed at Session 4 end), then `architecture-v4.md` §12 Session 5 (Hermes foundation: Telegram bot, iCloud-Drive watcher → Foundry queue, inter-agent router), §4.5 + §10 for the spec.
2. **`gotcha.md` has four new Session 4 priors at the bottom** under `## Session 4 priors`. Read those before debugging anything in Foundry / Triage / triage logs / cookie stripping / mode toggle.
3. **Don't add UI for CoPaw** — still silent by design (Session 3 prior carries forward).
4. **Don't add more controls to the chat header** — still two-button only (⟲ Reset + Memory ▸).
5. **Don't bypass the Foundry for external content** — the chokidar direct-drop path still works for "I trust this, skip triage" per the Part 13 §6 coexist decision, but external/uncertain content (web scrapes, iCloud drops, Telegram drops) flows through Foundry by design.
6. **`npm run dev` restart required after any `src/main/` change** — Foundry's main-process surface (`foundry.ts`, `hive.ts`, `ipc.ts`, `preload/index.ts`) means restart + Cmd+Shift+R for any preload binding change.

🍣
