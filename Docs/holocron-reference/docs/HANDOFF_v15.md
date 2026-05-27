# Handoff v15 — Architecture-v4 Session 3 (CoPaw + Hive foundation + Synthesis Agent)

**To:** the next Claude session
**From:** Session 3, 2026-05-14. Three parts in one session:
  - **Part A** — Honcho cleanup against the Session 2 open priors (Honcho v3 architecture intel from `gotcha.md` Session 2 priors §7): `postConclusion()`, `scheduleDream()`, and the single-call `/context` refactor for Reset Context.
  - **Part B** — CoPaw auto-capture (architecture-v4 §4.6, ~70 lines, heuristic v1, fire-and-forget Conclusions POSTing).
  - **Part C** — Hive foundation: new top-level tab between Codex and Domains; four agent monitoring cards (Honcho / Synthesis / Validation / Ingestion — Hermes comes in Session 5); Honcho Dreams panel with Approve → synthesis document; the **Synthesis Agent** (Claude Sonnet 4.6) wired to generate gap-bridge documents from the Codex → Syntheses tab; `sweepOrphans()` added to the boot self-healing sequence.
**You are starting:** the MVP + v13 + v14 + Session 2 baseline is intact. **Architecture-v4 Session 3 is complete.** The Hive tab exists, CoPaw is firing on every assistant response, the Synthesis Agent can draft bridge documents on demand, and structural-gap "Write synthesis · S3" buttons are no longer stubs. **Session 4 (Foundry foundation)** is the next planned chapter — see `architecture-v4.md` §12.

---

## 🛑 READ FIRST — verification rules (unchanged)

`npx tsc --noEmit -p tsconfig.web.json` for renderer changes. `npm run typecheck`'s `&&` still short-circuits on the node-side pre-existing errors; check the renderer alone with the explicit per-project invocation. Main-process changes need a full `npm run dev` cycle; renderer hot-reloads. `npm run test` = 28 vitest tests against the real test Postgres. **Still 28/28 at session end.** Zero new tsc errors introduced.

### Pre-existing tsc errors (unchanged — Session 8 triage still)

| File | Line(s) | Code | Note |
|---|---|---|---|
| `src/main/cleanupOps.ts` | 517 | TS2322 | `withRagClient` returns `number\|null`; line drift from new code |
| `src/main/convert.ts` | 20, 29 | TS2339 | mammoth + pdf-parse runtime quirks |
| `src/main/dashboard.ts` | 54 | TS18047 | `res.rowCount` nullable |
| `src/main/ipc.ts` | 504 | TS2345 | `path.basename` in `.map(...)` — line drifted from 304 (v14) → 466 (Sess 2) → 504 (Sess 3) as code was added above; same root cause |
| `src/main/ragIngest.ts` | 228 | TS2339 | `config.gemini` not on `HolocronConfig` (Session 3 hit the same shape via `config.anthropic` and worked around it via a local type assertion — see Chapter 7) |
| `src/renderer/src/components/chat/ChatMessage.tsx` | 67 | TS2353 + TS7031 | react-markdown component override |
| `src/renderer/src/components/codex/CodexPreview.tsx` | 1419, 1518 | TS2345 + TS2352 | ScribeColorTheme + ReactPortal |
| `src/renderer/src/components/hud/HUD.tsx` | 50 | TS2367 | `'dashboard'` literal vs `AppTab` |
| `src/renderer/src/components/scribe/selectionObserver.ts` | 14 | TS2344 | PluginValue |

Filter typecheck output for files YOU touch. Don't fix the above unless explicitly tasked — Session 8 in `architecture-v4.md` §12 is the dedicated triage pass.

---

## Read order (~25 min)

1. **`docs/STATUS.md`** — refresh after reading this handoff (it points at Session 4 next).
2. **This file** (HANDOFF_v15) — the Session 3 chapter.
3. **`docs/architecture-v4.md`** §12 — Session 4 (Foundry) is what's next.
4. **`docs/gotcha.md`** — Session 3 priors block at the bottom has four new entries before "Architecture priors".
5. **`docs/HANDOFF_v14.md`** Session 2 appendix — context for what Session 2 left open that Session 3 closed.

---

## Decisions locked at session start (do not relitigate)

- **Sonnet model ID = `claude-sonnet-4-6`** (Sonnet 4.6, current canonical). The earlier brief mentioned `claude-sonnet-4-20250514` — Andy confirmed the current canonical ID per the environment's model availability.
- **Dreams Panel included** (architecture-v4 Part 12 calls it out as Session 3, brief omitted it). Approve → synthesis document via the same gap-bridge Sonnet pipeline.
- **`sweepOrphans` on boot included** (architecture-v4 Part 12 calls it out as Session 3, brief omitted it). Idempotent; logs only when it deletes.

---

## Chapter 1 — Part A: Honcho cleanup

### 1.1 `postConclusion()` + `honcho:post-conclusion` IPC

Architecture-v4 §4.6 + the gotcha.md Session 2 prior §7 establish that Honcho v3 memory works via **Conclusions** — logical facts derived from interactions. The dialectic `/chat` and dream endpoints synthesize FROM the conclusions corpus, not from raw messages. CoPaw is the auto-capture client that writes facts so the corpus is dense enough for meaningful synthesis.

Endpoint: `POST /v3/workspaces/holocron/conclusions`
Body: `{ conclusions: [{ content, observer_id: 'andy', observed_id: 'andy', session_id? }] }`

`src/main/honcho.ts` gains `postConclusion(baseUrl, { content, session_id? })`. Degrades silently on any non-2xx with `[Honcho/Conclusion] ← N (degrading)`. The `observer_id` and `observed_id` are both `andy` — these are self-observed conclusions (Andy reflecting on Andy's work).

IPC: `honcho:post-conclusion` accepts `{ content, sessionId? }`. Returns `{ ok, error? }`. Fire-and-forget from the renderer.

### 1.2 `scheduleDream()` + `honcho:schedule-dream` IPC, and `honchoDream()` rework

The architecture-correct dream trigger is `POST /v3/workspaces/holocron/schedule_dream` with `{ observer: 'andy', dream_type: 'omni' }`. Returns 204 on success — the dream runs server-side and the result lands in the conclusions corpus over time (no synchronous insight). The dialectic `/chat` endpoint is the legacy fallback for deployments that don't have schedule_dream wired.

**`scheduleDream(baseUrl, dreamType='omni')`** in `honcho.ts` POSTs the request. Returns `{ ok: boolean; status: number; error? }`. The Hive's HONCHO card's "✦ Schedule Dream" button calls this directly.

**`honchoDream()`** rework: discriminated-union return type now.

```ts
export type DreamResult =
  | { ok: true; mode: 'scheduled' }                  // schedule_dream returned 204
  | { ok: true; mode: 'sync'; insight: string }      // /chat fallback path; immediate content
  | { ok: false; error: string }                     // both endpoints failed
```

Flow: schedule_dream first. On 204 → `mode: 'scheduled'` (no synchronous insight; the dream is in flight server-side). On non-2xx → fall back to the dialectic `/chat` endpoint; on success → `mode: 'sync'` with insight. On both failing → `ok: false`.

Callers updated for the new shape:
- `src/renderer/src/utils/threadActions.ts:dreamOnce()` — returns `DreamOnceResult` matching the union. Only persists to `dreamInsights[]` when `mode === 'sync'`.
- `src/renderer/src/components/chat/MemoryPanel.tsx` — "Dream now" handler surfaces `Dream scheduled — Honcho will process this in the background.` for scheduled mode vs `Dream insight saved.` for sync mode.
- `src/main/ipc.ts:thread:branch` — only folds the dream into `inheritedContext` when `mode === 'sync'`. Logs `[Thread/branch] Dreaming Agent scheduled (no synchronous insight to inherit)` for scheduled mode.

### 1.3 Single-call `/context` refactor for Reset Context

Pre-Session-3, `thread:reset-context` did two roundtrips on the fallback path: `getSessionContext()` for the server summary, then `getMessages()` separately when the LM fallback summarization needed transcript content. Redundant — `getSessionContext` already returns `{ messages, summary }` in one response.

Post-refactor (`src/main/ipc.ts:thread:reset-context`):
1. Single `getSessionContext(honchoUrl, oldSessionId, 4000)` call — pulls both summary AND messages.
2. If `ctx.summary` is set → use it (`summarySource: 'honcho'`).
3. Else if `ctx.messages.length > 0` → LM-summarize from THOSE messages (no second roundtrip).
4. **Last-resort safety net**: if `ctx.messages` came back empty (deployment mismatch), fall back to `getMessages()` directly — preserves Session 2 behaviour for older Honchos where `/context` might not include messages.

A `summarizeViaLM()` helper closes over the LM args + transcript-slicing logic so the happy path and the safety-net path share the same code.

---

## Chapter 2 — Part B: CoPaw auto-capture

### 2.1 Where it lives

All in `src/renderer/src/components/chat/useLMStream.ts` (~70 lines: extractor + helper + the hook in the onComplete branch). No new files.

### 2.2 Heuristic v1 extractor

```ts
const COPAW_DECISION_RE = /\b(decided|will|should|agreed|the deadline|andy prefers|andy wants|we need)\b/i
const COPAW_BULLET_RE   = /^\s*[-*•]\s+(.+?)\s*$/
const COPAW_NUMBERED_RE = /^\s*\d+\.\s+(.+?)\s*$/
const COPAW_MIN_LEN     = 20
const COPAW_MAX_PER_RESPONSE = 5
```

Patterns extracted from each assistant response:
1. **Bullet items** — lines starting with `- `, `* `, or `• `.
2. **Numbered items** — lines starting with `1.`, `2.`, etc.
3. **Decision sentences** — sentences matching the regex; multi-sentence lines are split on sentence terminators so each decision lands separately.

Filters:
- Min 20 chars (drops "yes", "no", "ok", short list-fillers).
- Strips trailing punctuation/whitespace.
- Skips lines starting with `yes/no/ok/sure/maybe` even if length passes.
- In-extraction dedup (case-insensitive content key in a `Set`).
- Max 5 conclusions per response (noise cap).

### 2.3 Where `fireCoPaw` hooks in

In `useLMStream.ts`'s `onLMEnd` handler, after the assistant message lands in chat AND after `onComplete` runs (which is the path that fires `honchoSaveMessage`). Sits inside the `else if (onComplete && !silent)` branch:

```ts
onComplete(accumulated)
fireCoPaw(accumulated, honchoCtx?.sessionId ?? null)
```

Explicitly **skipped** for:
- Redline responses (the editor-targeted REDLINE/END_REDLINE blocks are not durable facts).
- Silent flows (the "Address all comments" preset path that runs `opts.silent === true`).

### 2.4 Fire-and-forget contract

Every post is `void window.electronAPI.honchoPostConclusion(content, sessionId)` — no `await`, no `Promise.all`. Errors are logged to console and don't surface to the user. CoPaw never blocks the UI; if Honcho is down or the endpoint 404s, the chat keeps working.

Logs `[CoPaw] extracted N conclusion(s) from response (X chars)` exactly once per response — quiet by default, observable in DevTools when debugging extraction quality.

---

## Chapter 3 — Part C.0: Hive top-level tab

### 3.1 Tab plumbing

`src/renderer/src/store/sessionStore.ts` — `AppTab` union extended:

```ts
export type AppTab = 'scribe' | 'domaines' | 'codex' | 'hive' | 'hud'
```

`src/renderer/src/components/layout/Shell.tsx`:
- New `TabButton` between Codex and Domains. Glyph: `IconBrain` (matches the Memory panel's icon — consistent semantic).
- New render branch: `activeTab === 'hive' ? <Hive />`.

### 3.2 Component layout

`src/renderer/src/components/hive/` (new directory):
- `index.ts` — barrel export of `Hive`.
- `Hive.tsx` — top-level dashboard with header (title + "⟳ Refresh") and a `repeat(auto-fit, minmax(360px, 1fr))` grid of four cards.
- `CardShell.tsx` — shared visual shell (border-left accent, status dot, title, optional rightSlot for refresh button).
- `HonchoCard.tsx` — incl. Dreams panel inline (Chapter 4).
- `ValidationCard.tsx` — incl. health trend stub (Chapter 5).
- `IngestionCard.tsx` — read-only (Chapter 6).
- `SynthesisCard.tsx` — draft catalogue (Chapter 7).

### 3.3 Hive store (`src/renderer/src/store/hiveStore.ts`)

Caches per-card data + Dreams panel action state.

```ts
interface HiveState {
  honcho: HiveHonchoData | null
  honchoLoading: boolean
  validation: HiveValidationData | null
  validationLoading: boolean
  drafts: HiveSynthesisDraft[]
  draftsLoading: boolean

  rejectedDreamIds: Set<string>    // hidden this session
  deferredDreamIds: Set<string>    // hidden this session, no further action
  approvingDreamIds: Set<string>   // in-flight Approve calls

  refreshHoncho/refreshValidation/refreshDrafts/refreshAll
  markDreamRejected/markDreamDeferred/markDreamApproving
}
```

`refreshAll()` fires the three card refreshes in `Promise.all` — they hit different subsystems and shouldn't serialize. Card buttons fire their own refresh in isolation.

**Dream action state is in-memory only** — see gotcha.md Session 3 prior on persistence.

---

## Chapter 4 — Part C.1: HONCHO card + Dreams panel

### 4.1 Stats surfaced

- **Active sessions count** — threads with non-empty `honchoSessionId` (walked via `listProjects` + `listThreads` + `readThreadMeta`).
- **Synthesis-ready threads** — Memory files where `synthesisReady === true` (the Session 2 sticky flag).
- **Conclusions count** — best-effort `GET /v3/workspaces/holocron/conclusions/count?observer_id=andy`. Hidden when the endpoint returns non-2xx (Honcho deployments vary).

### 4.2 Actions

- **✦ Schedule Dream** — direct call to `honchoScheduleDream('omni')` IPC. Surfaces the 204 status in a 8-second toast: `Dream scheduled (status 204). Results will populate the panel after Honcho processes.`
- **→ Memory panel** — switches `activeTab` to `'scribe'`. The user expands the Memory drawer from the chat header from there.
- **→ Maintenance** — uses `openSettingsAt('maintenance')` deep-link (Session 2 infrastructure).

### 4.3 Dreams panel

Architecture-v4 §5.3. Lives inside the HONCHO card (not a separate page). Lists every `dreamInsight` across every thread in the workspace, newest-first by `queriedAt`.

Per-dream actions:
- **✦ Approve → synthesis** — kicks the gap-bridge Sonnet pipeline with the dream insight as cluster A (`Dream from <threadName>`) and "user's broader work" as cluster B. Result lands in `_Codex/Syntheses/dream-<timestamp>-<thread-slug>.md`. On success, the dream is `markDreamRejected`-ed (removed from the visible list) and `refreshDrafts()` runs so the SYNTHESIS card picks up the new draft.
- **Defer** — `markDreamDeferred()`. Hides the entry this session; no further side effect.
- **Reject** — `markDreamRejected()`. Hides + logged.

### 4.4 Honest known limit (carried to Session 4)

The Approve flow currently uses the gap-bridge generator with the dream as cluster A. The architecture spec says approved dreams should produce `synthesis_type='honcho-dream'` rows; today they're hardcoded `'gap-bridge'`. Session 4+ may want a dedicated dream-synthesis prompt + a parameterized `synthesis_type` in `generateGapBridge`. Functional but not yet semantically tagged correctly.

---

## Chapter 5 — Part C.2: VALIDATION card + `sweepOrphans` on boot

### 5.1 Stats surfaced

- **Orphan tags** — rag_tags rows not referenced by any rag_document_tags.
- **Zombie wiki docs** — rag_documents rows of `source_type='wiki'` whose source_path doesn't resolve to a live rag_wiki_pages slug.
- **Dead links (last sweep)** — `deadLinksFound` from the most recent `validation_sweep` row in `rag_operations_log` (we don't fs.stat every doc here — that's what "Run sweep now" does).
- **Last sweep timestamp** — top row of `rag_operations_log` filtered to validation-relevant kinds.
- **Recent sweeps** — last 5 rows, listed newest-first.

Backend: `gatherValidationStats()` in `src/main/hive.ts` — single function, three SQL queries, all bounded.

### 5.2 "Run sweep now" button

New IPC: `hive:run-validation-sweep`. Runs the full set:
1. `scanDeadLinks()` (read-only).
2. `scanOrphans()` (read-only).
3. `sweepOrphans()` (destructive — drops orphan tags + sourceless wiki pages).
4. `purgeDeadLinks()` (destructive — drops rag_documents pointing at vanished files + their orphan tags).
5. `runHealthScan()` (read-only — fresh counts).

Then logs a `validation_sweep` row to `rag_operations_log` with the full summary JSON so the trend sparkline can read it back. Reports a one-line result: `Swept N tag(s) + N wiki page(s) · purged N dead link(s).`

### 5.3 `sweepOrphans()` on boot

`src/main/index.ts` — wired into the boot self-healing sequence after the existing wiki-zombie-sweep. Idempotent; logs `[Boot] orphan sweep: tags=N wikiPages=N` unconditionally so a no-op pass is still visible in dev.

Architecture-v4 §4.3 calls this out as Session 3 work: "`sweepOrphans` on boot — it's currently manual-only; per the boot-self-healing pattern it should run on every boot like the others."

---

## Chapter 6 — Part C.3: INGESTION card (read-only)

### 6.1 What it shows

- **Total documents / tags / relationships** — from existing `ingestCounts()` IPC's `data` field.
- **Last ingest timestamp** — from the same response (`data.lastIngestAt`).
- **Health status badge** — `healthy` (all three counts zero) / `warning` (any non-zero) / `idle` (data not yet loaded). Driven by `ingestHealthScan()`.

### 6.2 What it doesn't show

No actions — Codex → Ingest still owns Sync/Pick/Re-ingest. The card has an explicit footer note: `Read-only. Use Codex → Ingest for Sync workspace / Pick & Ingest / Re-ingest controls.`

This is intentional. The Hive cards in Session 3 are monitoring surfaces; the existing tab-level controls aren't duplicated. Session 4's Foundry tab will own external-source ingestion (Firecrawl, paste-a-URL, iCloud drop, Telegram drop) and may absorb some of the existing Ingest tab affordances or leave them coexisting.

---

## Chapter 7 — Part C.4: SYNTHESIS card + Sonnet 4.6 generator

### 7.1 Generator backend

`src/main/hive.ts:generateGapBridge()` — composes the Sonnet prompt, calls `chat()` from `llmClient.ts`, writes the markdown file + the `rag_syntheses` row.

**Prompt shape** (per architecture-v4 §4.2 + Part 13 §9 explicit-request policy):
- System: "You are the Synthesis Agent inside Holocron, a personal knowledge base. Your job is to write bridge documents — short essays that connect two knowledge clusters the user works in but rarely connects explicitly. Write in the first person plural or impersonal, not as a chatbot. No preamble."
- User: Cluster A + B names + top tags + referenced documents + format requirements (400-600 words, markdown, clear thesis, 3-4 specific connecting insights, closing "Open questions" section with 2-3 questions).

**Settings:** Sonnet 4.6 (`claude-sonnet-4-6`), `temperature: 0.5`, `maxTokens: 1400`.

**Output:**
1. Markdown file at `<libraryPath>/Syntheses/<gap-slug>.md` with provenance frontmatter:
   ```yaml
   synthesis_type: gap-bridge
   gap_id: <id>
   cluster_a: "<name>"
   cluster_b: "<name>"
   generated_at: <iso>
   ```
2. `rag_syntheses` row with `synthesis_type='gap-bridge'`, `gap_id`, `source_clusters` (JSONB of both clusters), `disk_path`, `domaine_id` (optional).

Chokidar picks up the new file automatically — no manual re-ingest needed. The doc enters the Codex naturally.

### 7.2 IPC + handler

`synthesis:generate-gap-bridge` — accepts `{ gapId, clusterA, clusterB, topDocs, domaineId? }`. Returns `{ ok, filePath?, synthesisId?, error? }`.

Handler reads `cfg.anthropic` via a local type assertion (`(cfg as unknown as { anthropic?: { apiKey?, model? } }).anthropic`) because `HolocronConfig` doesn't declare `anthropic` (same pre-existing pattern as `config.gemini` in `ragIngest.ts` — both Session 8 territory; don't fix ad hoc).

Error paths:
- Missing API key → returns `{ ok: false, error: 'Anthropic API key not set — configure in Settings → Connections.' }`.
- Empty Sonnet response → `{ ok: false, error: 'empty content' }`.
- Disk write fail → `{ ok: false, error: 'disk write failed: <msg>' }`.
- DB insert fail → returns `ok: true` with the filePath but logs `[Synthesis] rag_syntheses insert failed (file written OK)` — chokidar still ingests the file regardless.

### 7.3 Wiring the Codex → Syntheses "Write synthesis · S3" buttons

`src/renderer/src/components/codex/Syntheses.tsx:GapsCard` — per-gap busy state + result rendering.

Top tags from each cluster are flattened (`a?.topTags?.map(t => t.tag)`) since the analytics layer surfaces `Array<{tag, share}>` while the Synthesis Agent prompt wants `string[]`. `topDocs` is empty for now — the analytics layer doesn't expose per-cluster doc lists in the gap-card data shape; the prompt gracefully handles "no specific documents" by drawing on tags. Future enhancement: surface top-BC docs per cluster.

On click → button reads "Generating…" until the IPC returns. On success → inline `Draft written. See Hive → Synthesis card or <filePath>.` On failure → inline `<error>`.

### 7.4 SYNTHESIS card view

Lists the 10 most-recent drafts from `rag_syntheses` (newest first) via new IPC `hive:list-syntheses`. Each draft shows synthesis_type chip, creation timestamp, title, truncated disk_path tail (with hover for full), and a "Review draft" button.

**Known limit (carried to Session 4):** the "Review draft" button currently just switches to Scribe — explicit "open this absolute path" is not yet exposed for paths outside the active thread tree. Wiring that requires editor-side imperatives. Workaround for now: user navigates to `_Codex/Syntheses/` in the sidebar workspace tree.

---

## Verification at Session 3 end

```
npm run test                            → 6 files / 28 tests passed (~2.0 s)
npx tsc --noEmit -p tsconfig.web.json   → 6 pre-existing errors, 0 new
npx tsc --noEmit -p tsconfig.node.json  → 6 pre-existing errors, 0 new (ipc.ts:466 → 504 is line drift)
```

No new errors. The 11 pre-existing errors are unchanged.

---

## Files touched in Session 3

### Main process (restart required)

- `src/main/honcho.ts` — `postConclusion()`, `scheduleDream()`, `honchoDream()` reworked to discriminated `DreamResult` union (schedule_dream first → /chat fallback).
- `src/main/hive.ts` (new) — `gatherHiveHonchoStats`, `gatherValidationStats`, `listRecentSyntheses`, `generateGapBridge`, type definitions.
- `src/main/ipc.ts` — seven new IPC handlers:
  - `honcho:post-conclusion`
  - `honcho:schedule-dream`
  - `hive:honcho-stats`
  - `hive:validation-stats`
  - `hive:list-syntheses`
  - `hive:run-validation-sweep`
  - `synthesis:generate-gap-bridge`
  - Plus: `thread:reset-context` refactored to single-call `/context`; `thread:branch` reads new `DreamResult` shape.
- `src/main/index.ts` — `sweepOrphans()` wired into boot self-healing sequence.

### Preload + types

- `src/preload/index.ts` — eight new bindings exposed: `honchoPostConclusion`, `honchoScheduleDream`, `hiveHonchoStats`, `hiveValidationStats`, `hiveRunValidationSweep`, `hiveListSyntheses`, `synthesisGenerateGapBridge`. (The `honchoDream` binding unchanged in surface; its return type evolved.)
- `src/renderer/src/types/ipc.ts` — matching signatures including the `DreamResult` discriminated union and the four Hive payload shapes.

### Renderer (hot-reloads)

- `src/renderer/src/store/sessionStore.ts` — `AppTab` union extended with `'hive'`.
- `src/renderer/src/store/hiveStore.ts` (new) — Hive cache + dream action Sets.
- `src/renderer/src/utils/threadActions.ts` — `dreamOnce()` result shape updated to match `DreamResult`.
- `src/renderer/src/components/chat/MemoryPanel.tsx` — Dream-now handler reads `result.mode`.
- `src/renderer/src/components/chat/useLMStream.ts` — CoPaw extractor + `fireCoPaw()` hook in `onComplete`.
- `src/renderer/src/components/codex/Syntheses.tsx` — GapsCard "Write synthesis · S3" wired to `synthesisGenerateGapBridge` with per-gap busy/result state.
- `src/renderer/src/components/layout/Shell.tsx` — Hive tab button + render branch.
- `src/renderer/src/components/hive/` (new directory):
  - `Hive.tsx`
  - `CardShell.tsx`
  - `HonchoCard.tsx`
  - `ValidationCard.tsx`
  - `IngestionCard.tsx`
  - `SynthesisCard.tsx`
  - `index.ts`

---

## What Session 3 did NOT touch (per scope)

- `themes.ts` / Fey design work — untouched.
- The 11 pre-existing tsc errors — still tabled for Session 8.
- `tsconfig.web.tsbuildinfo` — perpetually-dirty autogen, ignored.
- Migration files — migration 008 already exists (Session 1); no new tables needed (`rag_syntheses` columns sufficient for gap-bridge + dream-derived rows).
- Graph counter-scale or label logic — untouched.
- The active-file-content load in `buildSystemMessage` line 142 — left as-is (the Session 2 model-aware context window made cloud-model saturation a non-issue).

---

## Known limits carried into Session 4

1. **Dream action state (rejected/deferred) is in-memory only** — resets on app restart. Approved dreams are removed from `dreamInsights[]` indirectly (the synthesis doc absorbs them), but rejected/deferred ones reappear in the Dreams panel after restart. To make dismissals durable, add a `dismissedAt: string | null` field to the dreamInsight entry shape and have `markDreamRejected`/`markDreamDeferred` write through via a new IPC.

2. **"Review draft" navigation** opens Scribe but doesn't auto-open the specific synthesis file — the user navigates to `_Codex/Syntheses/` in the sidebar workspace tree manually. Wiring "open this absolute path in Scribe" requires editor-side imperatives we don't yet expose for paths outside the active thread tree. Future enhancement: a `scribe:open-path` IPC that takes an absolute path, mounts it as a preview tab in Scribe, and switches activeTab.

3. **Conclusions count endpoint may not be supported** by all Honcho v3 deployments. The HONCHO card hides the conclusions row honestly when the endpoint returns non-2xx. If/when the deployment exposes it, the row appears automatically; no code change needed.

4. **CoPaw is heuristic v1** (no LLM, regex-only). Architecture-v4 §4.6 spec'd a Gemini-Flash v2 upgrade ("pull the 3-5 durable facts from this") for when heuristic noise becomes a problem. v1 should ship quietly for a while — observe `[CoPaw]` console output; if it's surfacing junk consistently, that's the trigger for v2.

5. **Approve→synthesis hardcodes `synthesis_type='gap-bridge'`** even when the source is a dream. Architecture-v4 §7.5 specifies `synthesis_type='honcho-dream'` for dream-derived rows. Functional but semantically mistagged. Fix: parameterize `generateGapBridge` to accept a `synthesisType` arg, or split into two generator entrypoints sharing the same prompt scaffolding.

6. **`config.anthropic` not on `HolocronConfig` type** — same pre-existing pattern as `config.gemini` (HANDOFF_v14 table). Session 3 worked around via a local type assertion in `ipc.ts:synthesis:generate-gap-bridge`. Session 8 should fix the type declaration to cover both at once.

7. **Synthesis Agent doesn't yet receive `topDocs`** — the analytics-layer gap data shape doesn't expose per-cluster doc lists in the GapsCard's render path. Passed as `[]` for now. Future: the analytics layer should surface top-BC documents per cluster (which it already computes for the "Most influential documents" list) so the Synthesis prompt can name specific docs to reference.

8. **`schedule_dream` results don't auto-surface** — when honchoDream returns `mode: 'scheduled'`, the dream is in flight server-side but Holocron doesn't poll for completion. Andy will see the new dreamInsight on next thread reload or Hive refresh once Honcho's deriver writes it. A future enhancement: a Hive "Recent dream activity" poll, or a server-push channel.

---

## Hand-off (Session 3 final)

1. **Read `STATUS.md` first** (refreshed at Session 3 end), then `architecture-v4.md` §12 Session 4 (Foundry foundation: Firecrawl, paste-a-URL, Triage Agent, Review interface, Admission pipeline).
2. **`gotcha.md` has four new Session 3 priors at the bottom** under `## Session 3 priors`. Read those before debugging anything in CoPaw / Dreams panel / Synthesis Agent / Honcho v3 endpoints.
3. **Don't add UI for CoPaw** — it's silent by design. Output is visible in DevTools `[CoPaw]` console lines and (eventually) via the Honcho Dreams panel and synthesis output quality. The first new gotcha entry covers this explicitly.
4. **Don't add more controls to the chat header** — still two-button only (⟲ Reset + Memory ▸). Memory inspection lives in the Memory panel; destructive memory actions live in Settings → Maintenance; agent monitoring lives in the Hive.
5. **`npm run dev` restart required** — Session 3 touched `honcho.ts`, `hive.ts`, `ipc.ts`, `index.ts`, `preload/index.ts`. Renderer-only changes hot-reload fine; the new IPC bindings need a full preload re-load (kill + restart + Cmd+Shift+R).

🍣
