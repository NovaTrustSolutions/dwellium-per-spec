# 071 — The Hive widget: audit + hardening plan

Status: DRAFT (read-only audit 2026-09-27; nothing implemented). Base: `main` @ `0f9af7e`.
Swarm: ruflo `swarm-1790483340552-fo8f2l` (hierarchical; ruflo only *registered* the agents —
work ran as Claude Code subagents: 3 mappers by file ownership + 1 refute-first reviewer, 13 claims,
12 confirmed/partly, 1 refuted; orchestrator re-ran the PII extractor and the recall→prompt chain).

## 1. What the Hive is today

Files: `qualia-shell/src/components/Hive/Hive.tsx` (110 lines), `Hive/copawStore.ts` (100 lines),
`test/copawStore.test.ts`. Registry `widgetRegistry.ts:197` (tier `labs`). Spec:
`specs/DWELLIUM_FEATURE_SPEC_v2.md:348` "## 8. Agent Management — The Hive" (flat bullets; the
code's "§8.1–§8.8" numbering is invented).

| Spec bullet | Delivered | Evidence |
|---|---|---|
| Agent cards: status idle/running/**error**, last run, recent output | Partly — 7 hard-coded cards; "running" = window open & not minimized; no error, no last run, no output | Hive.tsx:18-26, 38, 60-70 |
| Cost attribution by agent and by Domain | No — provider name + a static sentence | Hive.tsx:51-56; `llmUsageStore.ts:24-42,123` has no agent/source field |
| Manual trigger for any agent | Yes — Run/Focus → `openWindow(id)`; works even though the targets are folded/hidden | Hive.tsx:39, 73-76; WindowContext.tsx:307 |
| Dreams panel | Link only — "Open Dreams (Honcho)" button | Hive.tsx:102-105 |
| CoPaw auto-capture | Yes, but unsafe (see D1) — heuristic sentence extractor; only Synthesis + Builder Agents call it | copawStore.ts:47-92; Synthesis.tsx:54; BuilderAgents.tsx:46 |
| Schema / PRD / Gap agents | Live in Builder Agents, launched from Hive | widgetRegistry.ts:184 |

Where CoPaw facts go: Hive rail, Content Search (`ContentSearch.tsx:63`), `unifiedMemory.recall()`
(`unifiedMemory.ts:38`) → "Memory Recall" skill (`lib/agents/skills.ts:432`) → orchestrator
"TOOL RESULTS" in persona prompts (`lib/agents/orchestrator.ts` ~L152-172). Synced to the backend by
One Save (`withSync`, objectType `copaw`, generic object route).

Visibility: `hive` is in `FOLDED_AGENT_WIDGETS` (`hiddenWidgetsStore.ts:56`) — hidden from the
sidebar by default; reachable via "+ Add widget", ⌘K (`dwelliumCommands.ts:33`), Task menu.

## 2. Findings (verified)

| id | sev | finding | evidence |
|---|---|---|---|
| D1 | **high** | `extractFacts` stores secrets/PII verbatim and fuses code fences/tables/headings into "facts". Repro: password, SSN, `sk-live-…` key, "```js const apiKey…", and a table row glued to a real sentence were all captured. Facts are synced to the backend, searchable, and re-sent into persona prompts via Memory Recall. | copawStore.ts:47-69; skills.ts:432-448; orchestrator.ts ~L152-172 |
| D2 | high | Trash button wipes all memory in one click, no confirm/undo; `[]` write-through becomes the durable remote value. | Hive.tsx:87-88; copawStore.ts:95-100 |
| D3 | med | No One Save `merge` → cross-device last-write-wins: device B flushing from a stale snapshot overwrites A's facts; A's next hydrate drops them. Same-device reload is protected (dirty marker). | copawStore.ts:33-38; oneSaveStore.ts hydrate ~L423-471 |
| D4 | med | Header "N running" counts **every** non-minimized window, not agents (screenshot: "5 running", 1 agent). | Hive.tsx:38, 48; Docs/widget-shots/widget-hive.png |
| D5 | med | Over-claims: registry promises "last action" + "cost by provider"; tip "watch its last action update" — neither exists. | widgetRegistry.ts:200-201 |
| D6 | med | Latte theme broken: literal `#0c0c0c/#070707/#161616/#1c1c1c/#222/#333` surfaces and `#666/#ddd/#444` text on a `#ede8ff` desktop. | Hive.tsx:46-103; themes-master.css:348-361 |
| D7 | low-med | Account switch mid-flight: Synthesis awaits `callLlm`, then `captureFacts` resolves the key from the *current* holder → user A's facts land in user B's key. Holder-in-render is the repo convention (not itself a bug); the async capture is. | Synthesis.tsx:44-56; copawStore.ts:19-22, 80-92 |
| D8 | low | Trash button has `title` only (no `aria-label`); `openWindow` failure (returns null) silently swallowed. | Hive.tsx:87, 39 |
| D9 | low | 500-fact cap silently evicts oldest; no size cap per payload. | copawStore.ts:90 |
| D10 | low | Zero tests render Hive; `unifiedMemory.test.ts` never exercises copaw via `recall()`. | test/ |

Refuted/downgraded during review: "Agent Lab duplicates Hive" — **partly false**: Agent Lab runs
user-authored personas and has no launcher for the 7 built-in agent widgets (grep: 0 refs). "Spec
§8.x has no source" — false; the spec exists (flat list).

## 3. Decision gate (Ilya) — before Phase 2

- **G1 keep vs merge.** Recommendation: **keep Hive as the launcher/status console, fix it in
  place** (Agent Lab doesn't cover the 7 built-ins). Alternative: move the 7-card grid into Agent
  Lab as a "Built-in agents" row and delete Hive (~110 lines gone; ⌘K `hive` alias → `agent-lab`).
- **G2 per-agent cost.** Needs plan 068 (AI Spend, still unmerged on `feat/068-ai-spend*`) to land
  first. Recommendation: Phase 3 only after 068 merges; until then the cost row says "not connected"
  and links to AI Spend.

## 4. Phases

Phase 1 is independent of G1/G2 and should ship first (D1/D2 are data-safety).

### Phase 1 — CoPaw safety (copawStore.ts + test only) — ~0.5 day
1. `extractFacts`: before splitting, strip fenced code blocks (```…```), inline code, table rows
   (lines starting `|`), markdown headings (`^#+ .*$`), and split on newlines as well as `.!?`.
2. Reject a candidate sentence if it matches a secret/PII pattern (new `SECRET_OR_PII` array in
   copawStore.ts — no dependency): `password|passcode|api[_ -]?key|secret|token` followed by `is|:|=`;
   `\bsk-[A-Za-z0-9_-]{16,}`, `\bAKIA[0-9A-Z]{16}\b`, `-----BEGIN [A-Z ]*PRIVATE KEY`, JWT
   `eyJ[\w-]+\.[\w-]+\.`; SSN `\b\d{3}-\d{2}-\d{4}\b`; card-like `\b(?:\d[ -]?){13,19}\b`;
   emails. `// ponytail: regex denylist, swap for an LLM/aidefence classifier if false negatives show up`.
3. Apply the same filter on **read** in `unifiedMemory.recall` for `source==='copaw'` hits, so
   already-captured bad facts stop reaching prompts without mutating stored data.
4. Capture the user key at call start: `captureFacts(source, text, now, key = resolveCopawKey())`;
   Synthesis/BuilderAgents resolve the key *before* `await callLlm` and pass it (fixes D7).
5. Tests (`copawStore.test.ts`): the orchestrator's repro text → zero secret/PII/code facts, the real
   sentence still captured; key-captured-before-await test; `unifiedMemory.test.ts` → copaw fact
   surfaces via `recall()` and a secret-shaped one does not. Mutation-check: delete the filter → test fails.
   **No migration that rewrites or deletes existing stored facts** (user data); the read filter covers them.

### Phase 2 — Hive UI honesty + safety (Hive.tsx, widgetRegistry.ts, new test) — ~0.5 day
1. D2: wrap Clear in `window.confirm('Delete all N CoPaw facts? This also removes them from your other devices.')`
   (ThoughtWeaver.tsx:496 precedent); `aria-label="Clear CoPaw memory"`. Per-fact delete button
   (user-initiated, one fact) so clearing everything is rarely needed.
2. D4: count only agent windows — `AGENTS.filter(a => openIds.has(a.id)).length`; label "open"
   instead of "running" (it is window state, not execution state).
3. D5: registry description/tip rewritten to what exists ("Launch any built-in agent, see which are
   open, browse CoPaw memory"); remove "§8.x" numbering from Hive.tsx header.
4. D6: replace literals with theme tokens (`--border-subtle`, `--bg-surface`/existing card tokens,
   `--text-tertiary`); move inline styles to `Hive.css` only if needed for a container query
   (collapse the 280px rail below ~900px).
5. D8: surface `openWindow` null via the existing `qualia-toast` event.
6. Memory rail: text filter box + source chip; render newest 100 with "show more" (D9 visibility).
7. `test/Hive.test.tsx`: renders 7 cards; open-count ignores non-agent windows; Clear requires
   confirm (confirm=false → store unchanged); Run calls openWindow with the id.
8. Harness screenshots dark + latte (standalone widget harness) — look at them; add a contrast assertion.

### Phase 3 — real status + cost (after G2 / plan 068 merges) — ~1-1.5 days
1. Add optional `source?: string` to `recordLlmUsage` input + `UsageEntry` (same field name as
   `MemoryFact.source`); thread through Synthesis, BuilderAgents, Stella, ARA, Hydra call sites.
2. Tiny `agentActivityStore` (per-user, in-memory + One Save optional): `{agentId, lastRunAt,
   lastStatus: 'ok'|'error', lastSnippet}` written where each agent already handles its LLM result.
   Cards show last run, error state (spec asks for idle/running/error), and snippet.
3. Cost row → per-agent 7-day totals from the usage ledger, "by Domain" only if entries carry a
   domain id (else say so). Link to AI Spend for detail.
4. Optional port from `Docs/holocron-reference/.../hive/CardShell.tsx`: `status + statusMessage`
   per card. Do NOT port the Electron filesystem aggregators (`main/hive.ts`).

### Phase 4 — CoPaw sync correctness (copawStore.ts) — ~0.5 day
1. Add `merge: (local, remote) => union by id, newest-first, capped 500` (twImportedStore.ts:61
   precedent). Deletes must win over the union: keep a small `deletedIds` tombstone list in the
   payload so a per-fact delete / clear on device A isn't resurrected by device B's union.
2. Tests: two-device interleave keeps both devices' facts; deleted fact stays deleted after merge.

## 5. Execution shape (ruflo swarm, per past runs)

One worktree `.claude/worktrees/071-hive` off `origin/main`, symlink `qualia-shell/node_modules`,
`git add` explicit paths only.
- P0 contract commit: `captureFacts(source, text, now?, key?)` signature + `source?` on usage input.
- W1 (parallel, disjoint files): coder A = copawStore.ts + unifiedMemory.ts + tests (Phase 1);
  coder B = Hive.tsx + widgetRegistry.ts + Hive.test.tsx (Phase 2); coder C = Synthesis.tsx +
  BuilderAgents.tsx key-before-await (Phase 1.4).
- Orchestrator read → full gate → commit.
- W2 adversarial reviewer; lenses: secret-filter bypasses (unicode, spacing, markdown-wrapped keys),
  confirm/undo paths, latte contrast, account switch mid-flight.
- Phase 3 and 4 as a second run after G1/G2.

Full gate (repo CLAUDE.md): `cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs`.
Ship: feature branch + draft PR only after the gate is green; never push `main`.
