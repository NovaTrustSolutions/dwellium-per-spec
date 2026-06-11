# Phase-10 Plan — One Conductor Arc Continuation (deep)

**Kickoff:** 2026-06-11 (per Ilya gate)  
**Predecessor:** Phase-9+ closure (2026-05-23) + Functional batch (2026-06-09) + Agent Lab (2026-06-10)  
**Scope:** Fold agents → ARA; LLM-routed command dispatch; true window tab-grouping; stabilize the Conductor foundation.

---

## Current State (as of 2026-06-11)

### ✅ Shipped this week
- **Tab tear-off** (2026-06-09): drag-off-canvas detection; coordinate-based window spawn
- **Widget add/remove** (2026-06-09): sidebar × to hide + gallery to re-add; One Save synced
- **Launch buttons** (2026-06-09): LangFlow, Paperclip, Open Notebook, adaptive backend (Electron IPC vs. Terminal hint)
- **Universal Shell 4-column** (2026-06-09): Filing Cabinet, Scratch Pad, Canvas, Orchestrator (Conductor chat)
- **Agent Lab** (2026-06-10): Personas (7 built-ins + custom), Teams (Research Squad, Deal Desk, Build Team), Orchestrator engine, Hermes run-memory + few-shot, folded 6 agent widgets
- **Hermes integration** (2026-06-10): per-user run recording + relevantPastRuns + rateRun

### 📊 Current Landscape
- **Standalone agents (6 folded):** Stella, Hydra, Two Brains, Synthesis, Hive, Builder Agents → now entry via Agent Lab
- **Ungrouped AI Tools:** ARA Console (⌘K / main chat), Memory widgets (Honcho, Cognitive M Network)
- **Heuristic routing:** ⌘K / ARA uses `matchSkill` + dwelliumCommands heuristic
- **Agent Studio:** Orchestrator runs sequentially per-team member; Hermes context injects past successes
- **Window model:** 5 quadrants (regions) + free-floating; tabs within regions; tear-off works; **no grouping yet**

---

## Remaining Scope (Phase-10 blocks)

### Block A: Agents → ARA (ARA as the AI unified door)
**Goal:** ARA becomes the single spawning point for all agent workflows (quick chat + team runs + persona solo).

#### A1. "Spawn X" commands in ARA
- Listen for patterns: "spawn research team", "run a deal desk analysis", "solo researcher on X"
- Route to Agent Lab orchestrator (existing) with pre-filled inputs
- Display team-run UI (decompose + member tasks + verify + merge) inside ARA chat
- Fallback: Agent Lab widget opened as a side-panel if full-screen preferred

**Files:** `src/lib/dwelliumCommands.ts` (new spawn routines) · `src/components/ARA/` (team-run display)

#### A2. Hermes hints in ARA (quick chat)
- When you ask ARA something similar to a past run, inject the top-K past ARA responses as context
- Separate from Agent Lab Hermes (ARA is quick interactive; labs are team batches)
- Vote 👍/👎 on ARA responses to train Hermes

**Files:** `src/lib/hermes/` (ARA-specific relevantPastRuns + rateRun) · ARA chat component

#### A3. Multi-agent command chaining
- "Open notepad and draft a letter" → ARA routes the first part to a system-command tool, the second to a writing agent
- "Calculate 15% of 2400 and email the result" → math tool + email agent
- Requires command-parse tree (user intent → sub-tasks) and per-tool routing

**Files:** `src/lib/llmClient.ts` (extend router for tool/agent selection) · `src/lib/dwelliumCommands.ts`

---

### Block B: LLM-routed command dispatch (replace heuristic routing)
**Goal:** Replace `matchSkill` heuristic with LLM-judged command routing (faster, more flexible, learns from use).

#### B1. Build a lightweight command-intent classifier
- Input: user text from ⌘K / ARA chat
- Output: intent type (chat, spawn-team, open-widget, system-command, etc.) + confidence
- Injects Hermes few-shot (past correct routing decisions as examples)
- Falls back to heuristic if confidence < threshold

**Files:** `src/lib/llmRouter.ts` (new) · Hermes integration for few-shot context

#### B2. Rewire ⌘K dispatcher
- Replace `matchSkill` heuristic with `llmRouter` call
- Keep heuristic as fallback (confidence < 0.7 → try heuristic)
- Log routing decisions for Hermes training

**Files:** `src/lib/dwelliumCommands.ts` · `src/components/QuickCommand/` (K-menu)

#### B3. Verify no regression on real-world patterns
- Existing command set must route with >95% accuracy
- Test across: agent spawns, widget opens, file ops, system health, theme changes
- Collect mis-routes and re-train Hermes weights

**Files:** `qualia-shell/src/test/llmRouter.test.tsx` (new; mock LLM)

---

### Block C: Window tab-grouping (true groups vs. grid cells)
**Goal:** Move from 5 fixed regions (tiling) to floating tab groups (browser-like; user-managed grouping).

**Honest scope note:** This is structural. Current Desktop model is region-based quadrants + free-floating. True grouping requires:
- New window/tab data model (groups contain tabs; tabs contain a component)
- A group-drag affordance (move an entire group, not individual tabs)
- Serialization of group state (One Save integration)
- Probably a 2-phase approach: (Phase 10 MVP) basic group CRUD + save/load; (Phase 11+) affordances + multi-group interactions

#### C1. Data model for tab-groups
- `TabGroup { id, title?, tabs: Tab[], layout: 'tabs'|'split-h'|'split-v' }`
- `Tab { id, componentId, props }`
- Replace region quadrants with serialized groups

**Files:** `src/lib/tabGroupStore.ts` (new) · One Save integration

#### C2. Group CRUD UI
- "Group tabs" button opens a panel to create/rename/delete groups
- Drag a tab → "New group" option or pick existing group
- Serialize groups to localStorage + One Save

**Files:** `src/components/Shell/TabGroupManager.tsx` (new) · Desktop.tsx refactor

#### C3. Decision gate: full restructure or incremental?
- **Option α (incremental):** keep the 5 regions internally, expose groups as a UI layer over them (less churn, safe fallback)
- **Option β (structural):** migrate Desktop entirely to group-based model (cleaner long-term, riskier short-term)

**Ilya decides at C1 PRE-FLIGHT.**

---

## Task Breakdown

### Phase-10 Sequencing

| Task | Title | Block | Scope (H) | Dependencies |
|---:|---|---|---:|---|
| 10.1 | A1 PRE0 — Spawn commands in ARA | A | 1 | Phase-9+ closure |
| 10.2 | A1 — Spawn research team, deal desk, solo persona | A | 4 | 10.1 |
| 10.3 | A2 — Hermes quick-chat hints in ARA | A | 3 | 10.2 + Hermes memory |
| 10.4 | A3 — Multi-step command chaining (parse + route) | A | 5 | 10.3 |
| 10.5 | B1 — LLM command-intent classifier (`llmRouter`) | B | 3 | 10.1 (context only) |
| 10.6 | B2 — Rewire ⌘K to use llmRouter | B | 2 | 10.5 |
| 10.7 | B3 — Verify routing accuracy + regression tests | B | 2 | 10.6 |
| 10.8 | C1 PRE0 + decision gate (incremental vs. structural) | C | 1 | Phase-9+ closure |
| 10.9 | C1 — Tab-group data model + One Save integration | C | 4 | 10.8 |
| 10.10 | C2 — Group CRUD UI + affordances | C | 3 | 10.9 |
| 10.11 | Closer — cross-block integration + full gate | — | 2 | 10.7 + 10.10 |

**Estimated duration:** 8–10 calendar days (15 H × 3–5 H per day typical pace)  
**Blocking gates:** 10.1 + 10.8 (decision points)  
**Carry-forward candidates:** C3 (if Option α chosen; full structural model deferred to Phase-11); multi-group drag interactions; Agent Lab team-run UI polish.

---

## Decision Gates (Ilya)

1. **10.1 PRE-FLIGHT:** Confirm Block A scope (ARA spawning agents) matches intent.
2. **10.5 PRE-FLIGHT:** Should LLM routing be per-user-LLM-key (integrate with existing per-user router) or fall back to backend?
3. **10.8 PRE-FLIGHT:** Tab-grouping architecture choice (Option α incremental vs. Option β structural).
4. **11.0 PRE-KICKOFF:** Deferred items from Phase-10 closure (carry-forward vote per closing context).

---

## Verification Strategy

- **Block A:** mock LLM orchestrator + vitest (spawn patterns, Hermes integration); live test: "spawn research team" in ARA
- **Block B:** mock LLM classifier + vitest (routing accuracy on existing ⌘K patterns); regression test suite
- **Block C (MVP):** vitest (group CRUD, One Save sync); live test: create group, move tabs, serialize/reload
- **Full gate:** Phase-10 mirrors Phase-8/9 (tsc -b + vitest + both builds + PII + SSR smoke)

---

## Files Overview

**New files (Phase-10 net):**
- `src/lib/agents/` — existing (Phase 6-10 prior); may extend personas.ts
- `src/lib/llmRouter.ts` — LLM-routed command classifier
- `src/lib/tabGroupStore.ts` — group model + serialization
- `src/components/Shell/TabGroupManager.tsx` — group CRUD UI
- `src/components/ARA/` — extensions (team-run display, Hermes hints)
- `qualia-shell/src/test/llmRouter.test.tsx`, `tabGroupStore.test.tsx` — new suites

**Modified files (Phase-10 refactor):**
- `src/lib/dwelliumCommands.ts` — spawn routines + routing integration
- `src/components/Shell/Desktop.tsx` — group awareness (Option α) or full migration (Option β)
- `src/lib/hermes/` — ARA-specific context
- `src/context/UserContext.tsx` — may refactor for group state (Option β only)

---

## References & Prior Art

- **Agent Lab orchestrator:** `src/lib/agents/orchestrator.ts` (existing; reuse decompose + execute + verify + merge)
- **Hermes run-memory:** `src/lib/hermes/` (existing; expand for ARA quick-chat context)
- **Per-user LLM routing:** `src/lib/llmClient.ts` (existing; leverage for command classifier)
- **One Save integration:** existing pattern (`hiddenWidgetsStore`, `savedLayoutsStore`); group state follows the same schema
- **Functional batch (2026-06-09):** tab tear-off + widget add/remove; Phase-10 builds on that baseline
- **BACKLOG.md:** carry-forward agent/command/window items; Phase-10 resolves ~3 of ~8 listed items

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| LLM routing confidence threshold too low → bad UX | Medium | High | Regression test suite (10.7); tuning gate at 95% baseline |
| Tab-grouping structural refactor breaks existing flows | High (Option β) | High | Incremental approach (Option α) preferred; fallback gates in place |
| Hermes few-shot context for ARA bloats token usage | Medium | Medium | Mock Hermes for tests (10.2, 10.3); cap past-runs to 3–5 examples |
| "Spawn team in ARA" UI clashes with existing chat layout | Medium | Medium | Side-panel + fullscreen modes; prototype in 10.2 PRE0 |

---

## Success Criteria

- **Phase-10 closure:** All 3 blocks at "DONE" state (or defined carry-forward)
- **Block A:** ARA can spawn all 3 agent workflows (team, solo, quick-chat-with-hermes); no regression in quick chat
- **Block B:** LLM router >95% accuracy on existing ⌘K patterns; fallback-to-heuristic at < 0.7 confidence
- **Block C (MVP):** Groups serialize + deserialize via One Save; no loss of open-windows state across reload
- **Full gate:** tsc -b + vitest + both builds + PII + SSR smoke all green; axe + screenshot baselines updated

---

## Consolidated Notes

**Ilya priorities (from 06-09/06-10 conversations):**
1. Agents mostly hidden now (Agent Lab door) — Phase-10 reintegrates them into the main ARA flow
2. Conductor heuristic → LLM routing: faster intent-matching + learns from use
3. True window groups: prepare for Phase-11+ multi-group orchestration

**Pre-kickoff checklist:**
- ✅ Functional batch + Agent Lab reviewed and live
- ✅ One Conductor foundation stable (orchestrator + Hermes + Team UI)
- ⏳ Phase-10 scope gates: await Ilya on A1 + B5 + C3
- ⏳ Carry-forward reconciliation: after Phase-10 closure
