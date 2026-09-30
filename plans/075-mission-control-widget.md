# 075 — Mission Control widget: audit + improvement plan

Status: DRAFT (read-only audit 2026-09-30; nothing implemented). Base: `origin/main` @ `4360f3a`
(local `main` @ `0f9af7e` is behind — it lacks the `captureOwner` guards; build from origin/main).
Swarm: ruflo `swarm-1790742375116-vcs151` (hierarchical). ruflo only *registered* the agents
(`mc-map-ui`, `mc-map-store`, `mc-map-agent`, `mc-refute`); the work ran as Claude Code subagents:
3 mappers by file ownership + 1 refute-first reviewer (14 claims: 14 confirmed, 1 narrowed, severities
re-derived). Orchestrator re-ran the refine regex, the progress formatting, and the CSS-token grep.

## 1. What Mission Control is today

Files: `qualia-shell/src/components/MissionControl/MissionControl.tsx` (169 lines) + `.css`,
`src/lib/goalsStore.ts`, `src/lib/goalPlanner.ts`, `src/test/missionControl.test.ts`.
Registry `widgetRegistry.ts:570` (category `ai`, 520×420 min); pinned dock `data/hierarchy.ts:60`.

| Capability | How | Evidence |
|---|---|---|
| Create a goal → AI plan | Title input → goal appears at once, then one LLM call drafts brief + agent actions + your actions + ≤4 clarifying questions; heuristic template if no LLM | MissionControl.tsx:116-130; goalPlanner.ts:14-82 |
| Create / refine from ARA | `new goal …`, `refine goal <title>: <answers>` (ARA Pass 1.6, before LLM intent classify) | ARAConsole.tsx:1665-1698; goalPlanner.ts:85-86 |
| Track | Status Active/Paused/Done, checkboxes on both lists, progress bar = done/total | MissionControl.tsx:31-47; goalsStore.ts:133-138 |
| ▶ Run with ARA | Pastes `For my goal "X": <action>` into ARA and opens it | MissionControl.tsx:22-25 |
| Notes | Append note (≤500 chars); last 3 shown | MissionControl.tsx:90-105 |
| Delete | Two-click confirm | MissionControl.tsx:36-42 |
| Persistence | Per-user localStorage `goals:<uid>` + One Save sync (objectType `goals`), owner-race guarded | goalsStore.ts:49-75; MissionControl.tsx:119,124 |
| Downstream readers | Dream corpus, ARA daily glance, Connections count, backend Morning Brief | dailySynthesis.ts:54-61; honchoBackgroundRunner.ts:106; ConnectionsPanel.tsx:43; backend morningBriefService.ts:123-170 |
| Spend tracking | Planner calls go through `callLlm` → AI Spend ledger | llmClient.ts ~118-133 |

## 2. Findings (verified)

| id | sev | finding | evidence |
|---|---|---|---|
| D1 | **high** | Refine hits the WRONG goal: `REFINE_GOAL_PATTERN` treats `-` as a separator, so `refine goal re-lease units: 12 doors` → title `"re"`; `findGoalByTitle` substring-matches the first goal containing "re" and its plan is replaced. Also `Q3 2026 - revenue: …` → `"Q3 2026"`. (Orchestrator + reviewer both ran it.) | goalPlanner.ts:86; goalsStore.ts:123-130 |
| D2 | med-high | Refine wipes progress: `updateGoalPlan` replaces the plan, every action back to `done:false`; the answers are never stored, so a second refine forgets the first. | ARAConsole.tsx:1691-1693; goalsStore.ts:96-98 |
| D3 | med | Dream + daily glance say "0.5% done" — `goalProgress` is 0..1 and is printed as a percent. Backend `goalPct` is correct. Existing test uses a hard-coded string, so it never exercised this. | dailySynthesis.ts:59; honchoBackgroundRunner.ts:106; dailySynthesis.test.ts:86 |
| D4 | med | A remote goal with a null/missing `plan.agentActions` passes `isGoal` and throws in `goalProgress` (probe reproduced). Widget ErrorBoundary contains it; backend PUT does no shape check. | goalsStore.ts:54-56,135; WidgetShell.tsx:130; backend objectRoutes.ts:78-97 |
| D5 | med | No One Save `merge` → whole-array last-writer-wins. Trigger (narrowed by reviewer): hydrate runs on login and on first lazy mount, not on focus — a stale second tab/device can resurrect a deleted goal or drop another device's new goal. | goalsStore.ts:68-75; oneSaveStore.ts:451-470,486-490 |
| D6 | med | "No LLM key is configured" is shown on ANY failure (401, 429, network, bad JSON) even with a working key. | goalPlanner.ts:42,79-81 |
| D7 | med | `findGoalByTitle` ignores status and picks the first match silently (can refine a Done goal). | goalsStore.ts:123-130 |
| D8 | med | Undefined theme tokens `--border-color` / `--surface-2` → hard-coded dark fallbacks in light/latte. **App-wide: 19 files** use them — separate task, not this plan. | MissionControl.css:10-51 |
| D9 | low-med | Account switch mid-create: early return skips `setTitle('')`, so user A's typed title stays in user B's input. | MissionControl.tsx:124-126 |
| D10 | low | "Sure?" delete confirm never disarms. | MissionControl.tsx:19,38-42 |
| D11 | low | Progress bar has no accessible name. | MissionControl.tsx:45 |
| D12 | low | Index keys on actions/questions/notes; no cap on notes or goals count; notes >3 unreachable in UI. | MissionControl.tsx:56,69,82,92; goalsStore.ts:112-116 |

Refuted / not included: ARA new-goal owner race (guarded on origin/main, ARAConsole.tsx:1674-1692);
double-Enter duplicate (React 19 flushes discrete keydown synchronously and the input disables — UNVERIFIED live, low).

Capability gaps (product, not bugs): clarifying questions can only be answered by typing an exact ARA
command; ▶ Run with ARA never links back or marks done; no edit of title/actions, no due date; the
template's "Monitor progress notes" has no mechanism behind it; no export.

## 3. Plan (smallest first; each phase = one PR)

### Phase 1 — correctness one-liners (~30 min)
1. D3: `Math.round(goalProgress(g) * 100)` at both sites + a test through the real formatter.
2. D1: separator = `:` or ` — ` only: `/^refine\s+goal\s+(.+?)\s*(?::|\s—\s)\s*(.+)$/i`. Tests for
   `re-lease`, `Q3 2026 - revenue`, existing `grow my channel: …`.
3. D7: `findGoalByTitle` prefers non-done, returns null + list on >1 substring match; ARA replies
   "Which one?" with the titles.
4. D6: `generateGoalPlan` returns `{ plan, reason: 'no-llm' | 'failed' }`; heuristic brief text per reason.
5. D9/D10/D11: clear title in `finally`; disarm confirm on blur / 4 s; `aria-label` on progressbar.

### Phase 2 — data safety (~1.5 h)
6. D4: `deserialize` validates nested shape (arrays of `{text,done}`, notes array, status enum),
   repairing rather than dropping the goal.
7. D2: `updateGoalPlan(id, plan, { keepDone: true })` carries `done` forward by normalized action text;
   add `answers: {ts,text}[]` to `Goal`, append on refine and pass ALL answers to the planner.
8. D5: pass `merge` to `withSync` — union by id, newer `updatedAt` wins, plus `deletedIds` tombstones
   (copy the `wikiStore.ts:109` shape). Test: stale-array hydrate doesn't resurrect a delete or drop a new goal.
9. D12: caps (e.g. 50 goals, 200 notes/goal); stable ids on actions (`id` field, migrated in deserialize).

### Phase 3 — make it useful (UI, needs Ilya's call on scope)
10. Inline "Answer questions" box on the card → refine (reuses Phase-2 path; no ARA syntax needed).
11. ▶ Run with ARA → on ARA's reply, add a note "ARA: <summary>" and offer "Mark done".
12. Edit title / add-remove action / optional target date; "Show all notes".
13. Proof: standalone widget harness screenshots in mocha + latte; axe; contrast.

Out of scope, filed separately: app-wide undefined `--border-color`/`--surface-2` tokens (19 files);
backend generic object PUT has no per-type shape validation.

## 4. Execution (ruflo swarm, house pattern)
P0 contract commit: `Goal.answers`, `GoalAction.id`, `generateGoalPlan` return type, `updateGoalPlan`
options — so tsc lists every caller. W1 (disjoint files): coder A `goalPlanner.ts` + ARA tier;
coder B `goalsStore.ts` (deserialize/merge/caps/keepDone); coder C `dailySynthesis.ts` +
`honchoBackgroundRunner.ts` + CSS. W2: one integrator owns `MissionControl.tsx`. W3: adversarial
reviewer with ≥3 real probes (hyphen titles, stale-tab hydrate, malformed remote, account switch).
Orchestrator: mutation-check each pinning test, full `npm test` + `tsc` gate on the final commit, harness
screenshots. No push/merge without Ilya's explicit say-so.

## 5. Phase 3 UI contract (accessible names — harness and integrator share this)


T = goal title, A = action text. Names are exact (aria-label or visible label).

Card header
- Rename button: `Rename goal T` → shows input `Goal title` (Enter saves, Escape cancels, blur saves).
- Status select `Status of T`; delete `Delete goal T`; progressbar `Progress for T` (unchanged).

Meta row (.mc__meta)
- `<input type="date">` aria-label `Target date for T`; when set, button `Clear target date for T`.
- Due badge text: `Due today` | `Due in N day(s)` (.mc__due--soon when ≤7 days) | `Overdue by N day(s)` (.mc__due--overdue). Computed from LOCAL calendar days.
- When answers exist: `Answered N×`.

Actions (both sides)
- Checkbox labelled by A (unchanged).
- Edit button `Edit action: A` → input `Action text` (Enter saves, Escape cancels). Remove button `Remove action: A`.
- Add form per side: input `Add agent action to T` / `Add your action to T` + button `Add`.

Agent-side run
- Button `Run with agent: A`. While running: text `Running…` inside role=status; the button is disabled.
- Result: role=region `Result for A` containing the text, and buttons `Mark done: A`, `Open in ARA: A`, `Dismiss result: A`.
- Mark done checks the action (does not dismiss the result). Dismiss clears the stored result.
- Failure: role=alert inside the action row: no LLM → `Add an AI key in Control Panel → API Keys to run agent actions.`; failed → `The agent run failed — try again.`
- On success also: a note `▶ A — result saved` and an artifact (source 'mission-control', title `T: A` ≤60 chars).
- Open in ARA keeps today's behaviour (requestAraPrompt + open ara-console) and includes the result text when present.

Clarifying questions
- Textarea `Answers for T`; button `Refine plan` (disabled while empty or refining).
- role=status text: `Refining…` → `Plan refined.` | `Add an AI key …` (no-llm path returns heuristic, so treat as refined) | `Refine failed — try again.`
- Always shown (revised after the live harness: hiding it once questions were answered unmounted it before "Plan refined." rendered and blocked further refines).

Notes
- When >3 notes: button `Show all N notes` / `Show fewer notes` with aria-expanded.

Owner safety
- Every async path (run, refine, create) captures the owner before the await and drops the write if it changed; per-card busy/result state must not leak across an account switch (key the card by goal id; clear pending UI state on unmount).
