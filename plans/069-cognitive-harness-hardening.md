# Plan 069 — Cognitive Harness hardening

**Branch:** `feat/069-cognitive-harness` (worktree `.claude/worktrees/069-cognitive-harness`, off `origin/main` `2862c0b`)
**Source audit:** 2026-09-25 read-only swarm audit (3 mappers + refute-first reviewer; 16/16 claims confirmed, 3 added). Findings reproduced in §1.
**Widget:** `qualia-shell/src/components/CognitiveHarness/CognitiveHarness.tsx` (+ `.css`), registry id `cognitive-harness`, dock label "Harness", HalocronOS memory tab.

## 0. Goal

Make the Harness a truthful, accessible, cheap live dashboard: every card shows numbers from a real store (or says honestly that nothing has been recorded), the canvas is correct and pauses when unseen, the widget follows the theme and is keyboard/screen-reader usable, and a unit test pins it.

Out of scope (tracked, not done here): engine stale-passage over-count on shrinking re-ingest (`shared.ts:166` ponytail note); `persist` success events (would spam the log on every ingest); Fact Check verdict counts (log is fetched inside `FactCheckLog.tsx` from the backend, no shared store — wire when a store exists); the app-wide latte `--text-secondary` 4.31:1 contrast (Docs/code.md, plan 064 question).

## 1. Findings addressed

| # | Finding | Evidence | Phase |
|---|---|---|---|
| F1 | `probe()` (full retrieval + PageRank) runs on every render | `CognitiveHarness.tsx:176`, `shared.ts:254` | P1 |
| F2 | Canvas effect deps `[activeIndex, entityCount]` → full reseed every 6 s and every ingest | `:394` | P1 |
| F3 | No `devicePixelRatio`; only `window` resize (app-window / sidebar resize ignored) | `:226-235` | P1 |
| F4 | rAF keeps running while mounted-but-hidden (tab-group member `display:none`) | `Desktop.tsx:1509` | P1 |
| F5 | Grid redrawn per frame | `:266-278` | P1 |
| F6 | No `prefers-reduced-motion` (3 keyframes, canvas, auto-cycle) | CSS 41/340/414 | P1 |
| F7 | Tabs/arrows are `<div onClick>`; no roles, keyboard, labels; canvas not `aria-hidden`; no live regions | `:410-451` | P1 |
| F8 | Zero theme tokens; ignores latte | CSS whole file | P1 |
| F9 | Contrast: `.ch-item-sub` 2.62:1 @8px, `.ch-metric-label` 4.18:1 @9px | CSS 181-183, 371-373 | P1 |
| F10 | Metrics grid stays 3 columns in the 440 px HalocronOS sidebar; only a viewport media query | CSS 354, HalocronOS.css 541 | P1 |
| F11 | Copy promises hover / tuning that don't exist; "ACTIVE SWEEPING", "LLM CORE / PARAMETER SPACE" | `widgetRegistry.ts:516`, `HalocronOS.tsx:662`, `:305/:416` | P0 |
| F12 | "— ms"; ellipsis on untruncated subtitles; hard-coded threshold `'0.6'`; "Vectors" overstates (only entity names embedded) | `:123/:136/:438`, `index.ts:79` | P1 |
| F13 | One probe drives all 4 wired pills — storage-full shows DEGRADED on RAG | `:398` | P0+P1 |
| F14 | 6 of 10 cards "Not connected" though 5 have real backing stores | `WIRED_IDS :23` | P1 |
| F15 | Engine data not shown: `ingests`, `lastIngestMs`, `hydrated` | `shared.ts` metrics | P1 |
| F16 | No vitest render test (halocronOS test mocks it); e2e asserts the old "Not connected" state | `halocronOS.test.tsx:65`, `e2e/cmn-057.spec.ts:172` | P2 |

## 2. Module contracts

**P0 (orchestrator, committed before W1):**
- `shared.ts`: `CmnMetrics.similarityThreshold: number` (from engine), `CmnProbe.kind: 'ok' | 'engine' | 'storage'`. `index.ts` `simThreshold` made `readonly` public.
- `src/components/CognitiveHarness/harnessTypes.ts`: `HarnessCardId`, `HarnessMetric`, `HarnessStatus {state:'ok'|'degraded'|'idle', label}`, `HarnessCard {metrics, status, source}`, `HarnessInputs {cmn, probe, runs, work, availableDocs}`.
- Copy: registry description/tip, HalocronOS card text.

**W1-A `src/components/CognitiveHarness/harnessMetrics.ts`** (pure, no React, no store reads):
```ts
export function harnessCard(id: HarnessCardId, input: HarnessInputs): HarnessCard;
export function formatMs(ms: number | null): string; // null → '—', else `${ms} ms`
```
Card rules (values are strings; never invent a number):
- `rag`: Queries · Last latency (`formatMs`) · Passages · Ingests. `graph-rag`: Entities · Facts · Bridges. `vector-db`: Embedded names (`counts.entities`) · Embedding `local hashed words + trigrams` · Threshold `String(cmn.similarityThreshold)`; source text states passages are matched by word overlap, not vectors. `memory`: Documents · Storage (`saved · N KB` / `NOT SAVED — full` / `NOT SAVED` / `nothing saved`) · Restored on load (`yes`/`no` from `hydrated`) · Conflicts resolved.
- Status for the 4 engine cards: `probe.kind === 'engine'` → degraded on all four; `probe.kind === 'storage'` → degraded on `memory` only, the other three `ok`; else `ok` with label `Connected`.
- `semantic-routing` (runs with `toolsUsed` ∋ `ROUTER_TOOL`): Decisions · Mis-routes (`outcome==='fail' || rating<0`) · Confidence threshold `ROUTER_CONFIDENCE_THRESHOLD` · Intents `ROUTE_INTENTS.length`.
- `prompt-opt` (runs ∋ `ARA_CHAT_TOOL`): Few-shot pool (not down-voted) · 👍 / 👎 counts `"u / d"` · Examples per answer `ARA_FEWSHOT_K`.
- `tool-use` (runs with ≥1 tool that is neither router nor ara-chat): Runs · Success rate (`Math.round(100*success/runs)%`, `—` when 0) · Distinct tools.
- `planning` (all persona tasks in `work`): Queued (todo) · Running · Done · Failed.
- `evaluation` (all runs): Rated · Approval (`% of rated with rating>0`, `—` when 0) · Failed runs.
- `ext-knowledge`: Available documents (`availableDocs`) · In memory (`cmn.documents`).
- Non-engine cards: zero records → `{state:'idle', label:'No activity yet'}`; otherwise `{state:'ok', label:'Live'}`. Degraded is reserved for real failures.
- Import constants from their modules (`ROUTER_TOOL`, `ROUTER_CONFIDENCE_THRESHOLD`, `ROUTE_INTENTS` from `lib/llmRouter`; `ARA_CHAT_TOOL`, `ARA_FEWSHOT_K` from `ARAConsole/araHermes`). If an import creates a cycle or pulls React, copy the constant with a `ponytail:` comment naming its source.

**W1-B `src/components/CognitiveHarness/harnessCanvas.ts`** (DOM-only, no React):
```ts
export interface HarnessCanvasOptions { seedCount: number; slots: number; activeIndex: number; reducedMotion: boolean; }
export interface HarnessCanvasHandle { setActive(index: number): void; setReducedMotion(on: boolean): void; destroy(): void; }
export function startHarnessCanvas(canvas: HTMLCanvasElement, opts: HarnessCanvasOptions): HarnessCanvasHandle;
```
- Deterministic xorshift PRNG (keep), particles seeded once per start; `setActive` only changes the highlight.
- `ResizeObserver` on the canvas; backing store = CSS size × `devicePixelRatio` with `ctx.setTransform(dpr,…)`.
- Runs rAF only while visible: `IntersectionObserver` (a `display:none` ancestor reports not intersecting) AND `document.visibilityState === 'visible'`. Stops rAF otherwise.
- Static grid pre-rendered to an offscreen canvas, re-rendered on resize/palette change.
- Colours from CSS custom properties on the canvas's parent (`--ch-canvas-bg`, `--ch-canvas-grid`, `--ch-canvas-ring-a`, `--ch-canvas-ring-b`, `--ch-canvas-particle-a`, `--ch-canvas-particle-b`, `--ch-canvas-active`, `--ch-canvas-label`), re-read when `<html>` `class`/`data-theme` changes (MutationObserver).
- Centre label text `MEMORY NETWORK` / `visualization`.
- `reducedMotion`: draw one static frame (and redraw on resize/palette/active change), no rAF.
- `destroy()` disconnects every observer and cancels rAF.

**W1-C `CognitiveHarness.css`** (+ nothing else):
- Define `--ch-*` on `.cognitive-harness` from theme tokens (`--bg-surface`, `--bg-surface-elevated`, `--bg-surface-hover`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent`, `--accent-text`, `--accent-subtle`, `--border-default`, `--border-subtle`, `--success`, `--warning`, `--danger`), including the canvas variables above. No hard-coded hex outside fallbacks.
- Text ≥ 4.5:1 in dark and latte (text uses `--text-*`/`--accent-text`, never `--accent`; status colours as text via `color-mix(in srgb, var(--success) 60%, var(--text-primary))`). Minimum text size 10 px.
- New DOM from the integrator (class names are the contract): outer wrapper `.ch-container` (`container-type: inline-size`) around `.cognitive-harness`; tabs are `<button class="ch-bar-item" role="tab">` inside `.ch-bar-list[role=tablist]`; arrows `<button class="ch-scroll-left|ch-scroll-right">`; play `<button class="ch-play-btn" aria-pressed>`; status pill `.ch-panel-status-indicator` with modifiers `--ok`, `--degraded`, `--idle`; `.ch-card-source` line under the metrics. Reset native button styles; visible `:focus-visible` ring.
- `@container (max-width: 560px)`: metrics grid 2 columns, visual space 1 column; `(max-width: 380px)`: 1 column. Metrics grid is `repeat(auto-fill, minmax(…))`-friendly for 3–4 metrics.
- `@media (prefers-reduced-motion: reduce)`: disable `ch-pulse`/`ch-ping`/`ch-flash` and smooth scrolling.

**W2 `CognitiveHarness.tsx` (one integrator) + `src/test/cognitiveHarness.test.tsx`:**
- Read `cmn` version via `useSyncExternalStore`; `probe` and `metrics` via `useMemo([cmn, version])`. Read `hermesLearningStore` and `personaWorkStore` with `useSyncExternalStore`; `availableDocs` memoized on `[uid, version]`.
- Cards via `harnessCard(id, inputs)`; delete `WIRED_IDS`, `metricsFor`, `persistText`, `makePrng`, the inline canvas effect.
- Canvas: start once on mount (`startHarnessCanvas`), `setActive` on tab change, `setReducedMotion` on media change, `destroy` on unmount.
- Reduced motion (`matchMedia('(prefers-reduced-motion: reduce)')`, listened): auto-cycle starts paused.
- A11y: WAI-ARIA tabs (roving `tabIndex`, ←/→/Home/End, `aria-selected`, `aria-controls="ch-panel-<id>"`, panel `role="tabpanel"`); arrow buttons `aria-label="Previous subsystem"/"Next subsystem"`; play button `aria-pressed` + `aria-label`; canvas `aria-hidden="true"`; log `role="log" aria-live="polite"`; status `role="status"`. Clicking or keyboard-selecting a tab pauses the cycle.
- Copy: title `COGNITIVE HARNESS`; play label `AUTO-CYCLE ON` / `AUTO-CYCLE PAUSED`; ellipsis only when truncated (or CSS `text-overflow`).
- Test: renders the real component with a fresh CMN (`resetCmnForTests`) and stores reset; asserts tablist + 10 tabs, keyboard ArrowRight moves selection, RAG shows `Connected`, prompt-opt shows `No activity yet` with no runs and `Live` after `recordRun` with `ara-chat`, "— " latency rendering, canvas `aria-hidden`, probe not re-run on a re-render that doesn't bump the version (spy `probe`).
- Update `e2e/cmn-057.spec.ts` harness test: title text, pill for prompt-opt matches `/No activity yet|Live/`.

## 3. Waves

| Wave | Agent | Owns (only these files) |
|---|---|---|
| P0 | orchestrator | `shared.ts`, `index.ts`, `harnessTypes.ts`, `widgetRegistry.ts`, `HalocronOS.tsx`, this plan |
| W1 | coder A | `harnessMetrics.ts`, `src/test/harnessMetrics.test.ts` |
| W1 | coder B | `harnessCanvas.ts`, `src/test/harnessCanvas.test.ts` (jsdom: start/destroy disconnects observers, reduced-motion draws without rAF, hidden → no rAF) |
| W1 | coder C | `CognitiveHarness.css` |
| W2 | integrator | `CognitiveHarness.tsx`, `src/test/cognitiveHarness.test.tsx`, `e2e/cmn-057.spec.ts` |
| W3 | adversarial reviewer | read-only; findings → orchestrator fixes |

Rules for every agent: no git writes; don't edit files you don't own; ignore type errors in files you don't own; don't run the scratchpad harness (orchestrator-only).

## 4. Verification

- Full gate from `qualia-shell/`: `npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build`, then `node Scripts/verify_no_pii_leak.mjs` and `SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs` from the repo root — on the FINAL commit.
- Standalone widget harness (real browser): dark + latte screenshots, computed text contrast ≥ 4.5:1 for every text node in the widget, 440 px container → metrics grid ≤ 2 columns, canvas backing width = CSS width × DPR, rAF stops when the host is `display:none`, keyboard tab navigation.
- `grep -n "probe()" CognitiveHarness.tsx` → only inside `useMemo`.

## 5. Acceptance checklist

- [x] All 10 cards read real stores; none says "Not connected"; idle cards say "No activity yet".
- [x] Storage-full degrades only the Memory card.
- [x] Probe/metrics computed once per engine version.
- [x] Canvas: no reseed on tab change, DPR-sharp, resizes with its container, stops when hidden, static under reduced motion.
- [x] Keyboard-operable tabs; labelled buttons; canvas hidden from AT; live log.
- [x] Theme tokens; text ≥ 4.5:1 in dark and latte (excluding the app-wide latte `--text-secondary` token issue, if hit — reported, not patched here).
- [x] Copy matches behaviour (registry, HalocronOS, title, play button, canvas label).
- [x] New vitest suites green; full gate green on final commit; e2e spec updated (run noted separately).

## 6. Execution record (2026-09-25)

Commits: `72de68a` contract · `4e38e40` W1 (3 coders) · `53f7871` W2 (integrator) · `20eb7eb` W3 review fixes. ruflo swarm `swarm-1790365666445-946v0y` registered the agents; the work ran as Claude Code subagents (ruflo-core:coder / reviewer).
Orchestrator catches beyond agent reports: persona `tasks` unguarded on load; canvas colours could throw in `addColorStop`; HalocronOS 7 px override; latte log contrast (fixed-black tint); accumulating grid; three over-claiming descriptions.
Reviewer (W3): hydrate post-await failure without emit (fixed + test); `aria-controls` on absent panels (fixed + test); status pill live-region spam + focus desync (pill no longer a live region; focus pauses cycle, tested); ext-knowledge labels (renamed). Rated by-design: router/tool double counting, mount-time particle seed.
Harness (standalone real-browser render, before vs after): after 16/16, before 3/16. e2e `cmn-057.spec.ts` updated, not run (needs the live shell login).
