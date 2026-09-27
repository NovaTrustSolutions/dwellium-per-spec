# Plan 068: AI Spend widget — honest capture, correct pricing, safe sync, useful UI

> **Executor instructions**: Execute phases in order. Each phase is one ruflo-swarm run
> (ruflo `swarm_init` + `agent_spawn` only REGISTER agents; the work runs as Claude Code
> `Agent` subagents — say so in the report). One worktree off `origin/main`
> (`.claude/worktrees/068-ai-spend`, symlink `qualia-shell/node_modules` to the main
> checkout's; `git add` explicit paths only). Honor every DECISION gate. Never
> DELETE/TRUNCATE/DROP anything in Supabase or the backend object store (CLAUDE.md).
> Full strict gate (repo `CLAUDE.md` → Useful commands) on the FINAL commit of every phase.
>
> **Drift check (run first)**:
> `git diff --stat 706233b..HEAD -- qualia-shell/src/lib/llmUsageStore.ts qualia-shell/src/lib/llmClient.ts qualia-shell/src/lib/llmStream.ts qualia-shell/src/lib/subscriptionsStore.ts qualia-shell/src/components/AiSpend qualia-shell/src/components/PersonaStudio/personaStream.ts qualia-shell/src/lib/oneSaveStore.ts`

## Status

- **Priority**: P0 (Phase 1), P1 (Phase 2), P2 (Phase 3–4)
- **Effort**: L overall (4 phases; 1–2 are M, 3 is M and backend, 4 is S–M)
- **Planned at**: frontend `706233b` (main), 2026-09-25
- **Source**: read-only audit. 4 mappers split by file ownership (capture / stores / UI / pricing),
  then 1 refute-first reviewer: **17 of 18 claims confirmed, 1 partly refuted** (C7: the
  "usage recorded before hydrate is lost" half is false because `oneSaveStore.ts:371` guards it).
  The orchestrator re-ran the price-table regexes and the DST probe, and re-checked the Anthropic prices
  against the `claude-api` skill table (cached 2026-06-24).

## What the widget is today (capabilities)

| Area | What it does | Where |
|---|---|---|
| Ledger | Every `callLlm` completion appends an ESTIMATED entry (chars/4 tokens × regex $/MTok table). Keeps the last 1,000 entries plus daily rollups forever. Per-user localStorage key plus One Save object `llm-usage` | `lib/llmUsageStore.ts:75-155`, `lib/llmClient.ts:70-80` |
| Other recorders | Streaming ARA (`llmStream.ts:256`), web search skill, DALL·E and Gemini image generation (`agents/skills.ts:255,347,377`) | |
| Widget: cards | Today (cost, calls, est. tokens), last 7 days (cost, calls), "Plan check" pace line (monthly pace → subscription-tier advice) | `components/AiSpend/AiSpend.tsx:51-66`, `llmUsageStore.ts:177-187` |
| Widget: chart | 14-day bar chart of estimated cost/day (divs with `title` tooltips) | `AiSpend.tsx:68-75` |
| Widget: providers | 7-day by-provider calls and cost | `AiSpend.tsx:27-36,77-87` |
| Widget: clear | Two-click "Clear" wipes the ledger | `AiSpend.tsx:42-48` |
| Time-value advisor | $/hr slider (5–500) → flags queued/running Hermes/Honcho tasks that AI or an online freelancer could do more cheaply (keyword categorizer + static benchmarks). Also shown read-only in the Honcho/Hermes panel | `CostAdvisorPanel.tsx`, `lib/costAdvisor.ts`, `lib/costKpiStore.ts` |
| Home "AI Spend" card | Headline = subscriptions/month + token spend over the Today/7/28-day range; click → `window.prompt` per subscription to edit its monthly price | `Shell/HalocronOS.tsx:337-353,710-717` |
| Subscriptions | Per-user list with One Save sync | `lib/subscriptionsStore.ts` |
| Other consumers | Nightly synthesis corpus (`dailySynthesis.ts:80-84`); Honcho deep cycle writes usage lines and calls the LLM for live freelance rates for the top 2 flagged tasks (`services/honchoBackgroundRunner.ts:101-116`) | |

Tests: `llmUsage.test.ts`, `costAdvisor.test.ts`, `subscriptionsPerUser.test.ts`, `holderIsolation.test.ts` — 33/33 green. None of them covers any defect below, and there are no render tests for `AiSpend` or `CostAdvisorPanel`.

## Verified defects

Severity: **H** = numbers the user trusts are wrong or data is lost/fabricated. **M** = wrong in common cases. **L** = polish.

### A. Capture — the ledger misses most real spend

| # | Sev | Defect | Evidence |
|---|---|---|---|
| A1 | H | Persona Studio's primary streaming path (anthropic/openai/local/custom) never records usage. Only the fallback `callLlm` does | `PersonaStudio/usePersonaCall.ts:48,625` imports `streamLlm` from `./personaStream` (0 `recordLlmUsage`); fallback at `:666` |
| A2 | H | Research Lab's LLM client calls providers directly and records nothing | `lib/researchLlm/client.ts:87`; UI-reachable via `ResearchLab.tsx` |
| A3 | H | Backend LLM calls (Morning Brief, ARA chat engine, LLM router, ~10 more services) can never reach the browser ledger. `araChatEngine` even reads `usage.total_tokens` and throws it away | backend `services/morningBriefService.ts:221`, `agents/araChatEngine.ts:355,383`, `routes/llmRouterRoutes.ts:69` |
| A4 | M | Real provider usage (Anthropic `usage` incl. cache fields, OpenAI `usage`, Gemini `usageMetadata`) is already in the parsed JSON but discarded; chars/4 is used instead | `llmClient.ts:344-356,391-395` |
| A5 | M | The reasoning-budget retry makes 2 billed calls but records 1 | `llmClient.ts:413-425,447-449,483-486` |
| A6 | M | An aborted or failed stream records nothing, though the provider billed the tokens it produced | `llmStream.ts:249-261` |
| A7 | M | Web search records `query.length + 50` chars (ignores results fed back as input and the per-search fee). Image generation records `promptChars: 4000` through the per-token table (images are billed per image) | `agents/skills.ts:258,350,377` |
| A8 | L | Control Panel "Test" pings count as spend | `llmClient.ts:152-172` |
| A9 | L | TTS / Whisper / avatar / Tavily / Brave spend is invisible (by design today; worth a line in the UI) | `usePersonaCall.ts:110,369`, `ttsVoices.ts:44`, `skills.ts:270-300` |
| A10 | M | The empty-state copy says "every ARA/skill/agent LLM call lands here automatically", which is false given A1–A3 | `AiSpend.tsx:79` |

### B. Pricing — the regex table is stale and too coarse

Orchestrator ran the table (`llmUsageStore.ts:92-110`) against real ids:

| Model id | Table gives $/MTok (in / out) | Official (in / out) | Source |
|---|---|---|---|
| `claude-fable-5-1` | **default 1 / 3** | 10 / 50 | claude-api skill table |
| `claude-opus-5-5` | 15 / 75 | 4 / 20 | claude-api skill |
| `claude-opus-4-8` (curated) | 15 / 75 | 5 / 25 | claude-api skill |
| `claude-sonnet-5` | 3 / 15 | 2 / 10 | claude-api skill |
| `claude-haiku-4-5` (default) | 0.8 / 4 | 1 / 5 | claude-api skill |
| `gpt-4.1-mini` / `gpt-4.1-nano` | 2.5 / 10 | 0.40 / 1.60 · 0.10 / 0.40 | developers.openai.com/api/docs/pricing |
| `o3` / `o3-mini` / `o4-mini` | 10 / 40 | 2 / 8 · 1.10 / 4.40 · 1.10 / 4.40 | same |
| `gpt-5`, `gpt-5-mini`, `gpt-4-turbo`, `gpt-3.5-turbo` (last two curated) | **default 1 / 3** | not re-verified — **UNVERIFIED** | — |
| `gemini-2.5-flash` | 0.1 / 0.4 | 0.30 / 2.50 | ai.google.dev/gemini-api/docs/pricing |
| `gemini-2.5-pro` | 1.25 / 5 | 1.25 / 10 (≤200k) | same |
| `gemini-1.5-*` (shipped default) | 0.1 / 0.4 | no longer listed — **UNVERIFIED** | same |

| # | Sev | Defect |
|---|---|---|
| B1 | H | Unknown models silently get $1/$3, and the UI doesn't say a price was guessed. Fable 5.1 is under-counted 10–17× |
| B2 | M | Coarse substring rows mis-price whole families (above). Custom/OpenRouter ids match by substring |
| B3 | M | Cache reads (~0.1× input) and cache writes (~1.25×) aren't modelled. Only fixable with real usage (A4) |

### C. Persistence and sync

| # | Sev | Defect | Evidence |
|---|---|---|---|
| C1 | H | `llm-usage` has no `merge`, so hydrate whole-replaces and the last device to write wins; another device's usage disappears | `llmUsageStore.ts:75-82`, `oneSaveStore.ts:387-389` |
| C2 | H | "Clear" writes an empty ledger through One Save, which wipes every other device on its next hydrate | `llmUsageStore.ts:189-191` |
| C3 | M | No `storage` listener; two tabs overwrite each other's entries | `createLocalStorageStore.ts:27` |
| C4 | M | Usage is keyed by the holder at write time, after an `await`. A logout or account switch mid-call writes into `_anonymous` or the other user's ledger. Nothing closes this window | `UserContext.tsx:119-131`, `perUserIdentity.ts:157-160` (systemic across ~30 holders; fix here only for spend) |
| C5 | L | `days` rollups are never pruned, and every record sends the whole ledger (coalesced at 800 ms) | `llmUsageStore.ts:139-152` |
| C6 | L | DST: `lastNDays` subtracts fixed 24 h, so at 00:00–00:59 the day after spring-forward the chart skips a day. Reproduced: TZ=America/New_York at 2026-03-09 00:30 → `03-06 03-07 03-09` | `llmUsageStore.ts:159-167` |

### D. Subscriptions and the Home card

| # | Sev | Defect | Evidence |
|---|---|---|---|
| D1 | H | New users get sample subscriptions (Claude Max $200, ChatGPT Plus $20, Codex) shown as their real spend. This violates the no-sample-data rule | `subscriptionsStore.ts:33-39` |
| D2 | H | A fake "Google Max plan $200" is synthesized when a Gemini key exists, and **persisted** the first time the user edits plans (`editPlans` maps over the hook's augmented array) | `subscriptionsStore.ts:77-84`, `HalocronOS.tsx:347-353` |
| D3 | M | The headline adds a full month of subscriptions to the selected range's token spend. With "Today" selected it shows ~$220 + one day of tokens as "AI SPEND" | `HalocronOS.tsx:339-343,712-713` |
| D4 | L | Plan editing is sequential `window.prompt` with no add/remove. `deserialize` silently drops rows with no name | `HalocronOS.tsx:347-353`, `subscriptionsStore.ts:41-52` |

### E. Widget UI / advisor

| # | Sev | Defect | Evidence |
|---|---|---|---|
| E1 | M | "Really clear?" never resets, so a stray click later wipes the ledger | `AiSpend.tsx:18,44` |
| E2 | M | The chart is inaccessible (divs + `title` only). No per-model or per-feature view though entries carry `model` | `AiSpend.tsx:68-75` |
| E3 | L | `providers` memo depends on a fresh array each render | `AiSpend.tsx:22,36` |
| E4 | L | `--border-color` and `--surface-2` are undefined anywhere in `src/**/*.css`, so the dark fallbacks always apply (wrong in latte) | `AiSpend.css:22,32-33`, `CostAdvisorPanel.css` |
| E5 | L | Advisor recommendations have no action (dismiss / delegate). AI cost is a static guess, never tied to the ledger. "email" always categorizes as writing | `CostAdvisorPanel.tsx:70-89`, `costAdvisor.ts:55-79` |
| E6 | M (privacy) | The live-rate call sends verbatim task titles to the LLM. Category + role are enough | `costAdvisor.ts:250-256`, `honchoBackgroundRunner.ts:113-116` |

## Improvements (what "good" looks like)

1. **Measured, not guessed**: use provider-reported tokens whenever a response has them; fall back to chars/4 only when it doesn't, and flag each entry `measured: true|false`. The UI shows "92% measured".
2. **Complete**: every browser AI call path records (Persona, Research, retries, partial streams, per-search and per-image fees). Backend usage lands in the same view (Phase 3). The UI is honest about what is still uncovered (TTS/STT).
3. **Priced honestly**: an anchored, dated price table; unknown model → cost `null` and a visible "N calls unpriced" (never a silent $1/$3).
4. **Sync-safe**: per-device sub-ledgers merged on hydrate; clear is a `clearedAt` tombstone, not an empty overwrite; usage is keyed by the user at call start.
5. **Real subscriptions only**: empty by default; a proper editor; prorated to the selected range.
6. **More useful views**: by model and by feature (`source`), monthly budget with pace alert, accessible chart + table, CSV export.
7. **Actionable advisor**: dismiss/snooze; "delegate to Hermes"; its AI cost comes from the real per-category ledger average when one exists.

## Module contracts (pre-seed before W1 so parallel agents agree)

```ts
// lib/llmPricing.ts (NEW) — single source of truth for prices
export interface ModelPrice { inPerM: number; outPerM: number; cacheReadPerM?: number; cacheWritePerM?: number }
export const PRICES_AS_OF: string;                       // e.g. '2026-09-25'
export function priceFor(model: string, provider: LlmProvider): ModelPrice | null; // null = unpriced; local → {0,0}
export function perCallFeeUsd(kind: 'web_search' | 'image', model: string): number | null;

// types/integrations.ts — LlmResponse gains:
usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };

// lib/llmUsageStore.ts
export interface UsageInput {
  provider: LlmProvider; model: string;
  promptChars: number; responseChars: number;           // fallback estimate
  usage?: LlmResponse['usage'];                          // preferred when present
  extraCostUsd?: number;                                 // per-search / per-image fees
  source?: string;                                       // 'ara' | 'persona' | 'research' | 'skill:web_search' | 'honcho' | 'test' ...
  userId: string | null;                                 // REQUIRED: captured BEFORE the await (C4)
}
export interface UsageEntry { ts: number; provider: LlmProvider; model: string; estIn: number; estOut: number;
  estCost: number | null; measured: boolean; source?: string }
export interface DeviceLedger { entries: UsageEntry[]; days: Record<string, DailyRollup> }
export interface StoredLedgerV2 { v: 2; clearedAt: number; devices: Record<string /*deviceId*/, DeviceLedger> }
export function recordLlmUsage(input: UsageInput): void;   // never throws; drops (and counts) if userId ≠ current holder
export function useLlmUsage(): UsageLedger;                // UNCHANGED public shape { entries, days } = aggregate across devices, after clearedAt
export function lastNDays(n: number, ledger?: UsageLedger): DailyRollup[]; // calendar-day stepping (C6)
```

`userId` is a REQUIRED argument so `tsc` lists every caller for the W2 integrator. Keeping `useLlmUsage()`'s return shape means `HalocronOS`, `dailySynthesis` and `honchoBackgroundRunner` don't change. `DailyRollup` gains optional `unpriced: number`, `measuredCalls: number`, `bySource`, `byModel`.

Merge rule for `llm-usage` (`withSync({ merge })`): `clearedAt = max(local, remote)`; `devices = {...remote.devices, [thisDevice]: local.devices[thisDevice]}` (a device owns its own sub-ledger, so there is nothing to double-count); drop entries and rollup days older than `clearedAt`. Device id: reuse an existing per-browser id if the repo has one (grep `deviceId` first); otherwise `crypto.randomUUID()` in localStorage.

## Phases

### Phase 1 — Correctness (P0, frontend only)

**W1 — 4 coders, disjoint files, in parallel** (tell them: ignore type errors in files you don't own; no git writes; the harness is orchestrator-only):

| Agent | Owns | Does |
|---|---|---|
| F1 store | `lib/llmUsageStore.ts`, `lib/llmPricing.ts` (new), `test/llmUsage.test.ts` | v2 ledger + v1 → v2 migration under this device; merge; `clearedAt` clear; re-read localStorage inside `recordLlmUsage` before modifying (C3) + a `storage` listener that invalidates the cache; captured-`userId` guard; calendar-day `lastNDays`; prune `days` > 400; pricing table from the B table with anchored patterns, `null` for unknown |
| F2 client | `lib/llmClient.ts`, `lib/llmStream.ts`, `types/integrations.ts` (`usage` field only), their tests | Parse real usage (Anthropic incl. cache, OpenAI, Gemini, Anthropic SSE `message_delta` usage); record the discarded retry attempt; `try/finally` partial-stream recording; capture `userId` before `await`; `source` passthrough on `LlmRequest`; `testProvider` → `source: 'test'` |
| F3 subs | `lib/subscriptionsStore.ts`, `test/subscriptionsPerUser.test.ts`, `HalocronOS.tsx` lines 337–353 and 710–717 ONLY | `defaults()` → `[]`; delete the synthetic Google row (a Gemini key isn't proof of a paid plan); `editPlans` reads the raw store snapshot; prorate subscriptions to the range (`monthly × days / 30`) and label it |
| F4 UI | `components/AiSpend/*`, new `test/aiSpend.test.tsx` | Confirm resets after 4 s; true empty-state copy + a "not yet tracked: TTS/STT/backend" line; "N calls unpriced" and "% measured" chips; define tokens via existing theme vars (grep `themes-master.css` for the border/surface equivalents); memo fix |

**Orchestrator read of W1** (known traps): v1 → v2 migration must not lose existing entries; `merge` must be pure; the `storage` handler must not write; every `recordLlmUsage` caller compiles with `userId`.

**W2 — 1 integrator**: owns `PersonaStudio/personaStream.ts`, `usePersonaCall.ts`, `lib/researchLlm/client.ts`, `lib/agents/skills.ts`, `services/honchoBackgroundRunner.ts`. Records A1/A2 (with real usage from their SSE/JSON), A7 per-search/per-image fees via `perCallFeeUsd`, `source` on every call, and E6 (send category + role, not the title). Fixes every `tsc` error from the required `userId`.

**W3 — adversarial reviewer** with a break list: two tabs recording at once; device A clears while device B is offline, then B records and hydrates (B's post-clear entries must survive, pre-clear ones must go); logout mid-stream; v1 ledger with 1,000 entries migrates intact; unknown model shows as unpriced; the retry path bills 2 attempts; an aborted persona stream records partial output; DST probe at 2026-03-09T00:30 America/New_York; a new user's Home card shows $0 subscriptions.

**Tests to add** (mutation-check each: break the code and watch it fail): merge commutativity + clear tombstone; migration; calendar-day `lastNDays` under `TZ`; `priceFor` table-driven over every id in the B table + `CURATED_MODELS`; usage parsing per provider (fixture JSON); retry double record; partial stream; userId-mismatch drop; subscriptions default `[]`; `editPlans` does not persist synthetic rows; AiSpend render (confirm reset with `vi.setSystemTime` + `waitFor`, NOT `useFakeTimers` — see repo Conventions).

**Verify**: full strict gate; standalone widget harness (`dwellium-standalone-widget-harness` memory) before/after screenshots of AiSpend + the Home card in dark and latte, with assertion-first capture.

### Phase 1 status — DONE (PR #147, merged `fce936b`, 2026-09-26)

Also landed separately: PR #148 (`captureOwner()` owner-race guard for every async per-user writer).

### Phase 2 — Useful views (P1, frontend only)

**Phase 2 contract (pre-seeded before W1).** Holder `aiBudgetUserIdHolder` is added to `lib/perUserIdentity.ts` (in `ALL_HOLDERS`).

```ts
// lib/aiBudgetStore.ts (F1) — per-user, One Save 'ai-budget', .reset(); default = no budget (null), never a sample figure
export function useAiBudget(): number | null;               // monthly USD, null = none set
export function setAiBudget(monthlyUsd: number | null): void; // clamps to [1, 100000], rounds to cents; null clears
export interface BudgetPace { spentToDate: number; projected: number; budget: number; ratio: number; status: 'ok' | 'warn' | 'over' }
// spentToDate = subscriptions monthly total + token spend this calendar month; projected = subscriptions +
// month-to-date tokens / elapsed days × days in month; ratio = projected / budget; warn at ≥ 0.9, over at > 1.
export function budgetPace(ledger: UsageLedger, budget: number, subscriptionsMonthly: number, now?: number): BudgetPace;
export function budgetBriefLine(): string | null;           // null unless a budget is set AND status !== 'ok'
// components/AiSpend/BudgetBar.tsx (F1)
export default function BudgetBar(props: { ledger: UsageLedger }): JSX.Element;

// lib/spendExport.ts (F2)
export function entriesToCsv(entries: UsageEntry[]): string;   // header + one row per entry; RFC 4180 quoting; unpriced cost = empty cell
export function downloadCsv(filename: string, csv: string): void;
// components/AiSpend/SpendBreakdown.tsx (F2)
export default function SpendBreakdown(props: { ledger: UsageLedger }): JSX.Element; // tabs "By model" / "By feature", 7 / 30 days, CSV export

// components/AiSpend/SubscriptionsEditor.tsx (F3)
export default function SubscriptionsEditor(): JSX.Element;  // list + add / rename / reprice / remove via saveSubscriptions
```


W1 two coders: (a) `AiSpend.tsx` tabs **Overview / By model / By feature**, an accessible chart (`role="img"` + visually-hidden table), CSV export of entries (client-side Blob); (b) budget: new `aiBudgetStore.ts` (per-user, One Save, `.reset()`), monthly budget input, a pace-vs-budget bar, and a warning line in the widget + Morning Brief when the pace exceeds budget. W2 reviewer. Add a proper subscriptions editor (add / remove / rename) in the widget, replacing `window.prompt` (D4).

### Phase 3 — Server-side and real bills (P2) — **DECISION gate (Ilya)**

1. **Backend usage log**: one helper `recordServerLlmUsage(userId, {provider, model, usage, source})` called from every backend LLM site (start with the three in A3; grep for the rest) → per-user One Save object `llm-usage-server` (read-only for the client). The widget adds a "Server" provider group. Backend work goes in `~/dwellium-backend/worktrees/068-ai-spend`.
2. **Reconcile with real invoices (optional)**: Anthropic Usage & Cost Admin API and OpenAI org costs API are backend-only and need **admin** keys (`sk-ant-admin…` / OpenAI admin key). Ilya enters them himself in the terminal (never pasted in chat, never read from files). Show "billed (provider) vs estimated (ledger)" per month. Google has no per-key cost API (Cloud Billing export only) — skip.
3. **Claude Code CLI spend (optional)**: `~/.token-saver/stats-*.json` already has `fresh_input_tokens`, cache read/write and output totals per scope. Surface them as a "CLI (Claude Code)" row priced via `llmPricing.ts`. Desktop/Electron only; the web app can't read `~`.

Questions for Ilya: (a) do backend calls count toward the user's widget total, or show separately? (b) do you want the admin-key reconciliation at all? (c) include CLI usage?

### Phase 4 — Advisor (P2)

Dismiss/snooze per task (persisted), "Delegate to Hermes" button (enqueue on the persona queue that already exists), AI cost per category from the ledger's `bySource` average when ≥5 samples, categorizer fix for "email" (reply/respond → support first). Tests: categorizer table + evaluateTasks with dismissed ids.

## Out of scope / not doing

- Blocking or throttling calls when over budget (warning only; blocking needs its own decision).
- Fixing the ~30-holder login race (C4) systemically. Phase 1 closes it for spend only; spin a separate task for the rest.
- TTS/STT/avatar pricing (listed as untracked in the UI).
