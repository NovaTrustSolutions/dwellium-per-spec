# Phase-10 Task 10.1 — A1 PRE0: Spawn Commands in ARA (Scoping)

**Date:** 2026-06-11
**Class:** SCOPING-ONLY (9th sub-shape: Phase-10 Block-A PRE0 with gate-citation verification)
**Production source touched:** NONE
**Gates locked at kickoff (Ilya, 2026-06-11):**
1. **10.1 Block A scope:** CONFIRMED as planned — ARA is the single spawning point; team-run UI inside ARA chat.
2. **10.5 LLM routing:** per-user key first (llmClient browser-direct) → backend fallback → heuristic. Matches the ThoughtWeaver/FactCheck/Stella cascade.
3. **10.8 Tab grouping:** **Option α (incremental)** — groups as a UI layer over the 5 regions; structural migration deferred to Phase-11.

---

## 1. Plan-citation verification (v2.76.0 discipline)

Per the standing PRE-FLIGHT rule, every Phase_10_Plan.md file citation was empirically verified against the tree at `c7ffbf8`:

| Plan citation | Verdict | Actual |
|---|---|---|
| `src/lib/dwelliumCommands.ts` | ✅ EXISTS | 356 L; `parseCommand` + `spawnAgent` + 20 exported verbs |
| `src/lib/llmClient.ts` | ✅ EXISTS | per-user router (Phase `dc938fe`) |
| `src/lib/agents/orchestrator.ts` | ✅ EXISTS | `runTeam` (L203) + `runPersona` (L247) + `RunEvent`/`MemberTaskEvent` streaming callbacks |
| `src/components/ARA/` | ❌ **DRIFT** | Real path: `src/components/ARAConsole/ARAConsole.tsx` |
| `src/lib/hermes/` | ❌ **DRIFT** | No such dir. Hermes lives at `src/components/HonchoHermesPanel/` (`hermesRunner.ts` + `hermesLearningStore.ts` with `rankPastRuns`/`computeToolWeights`/`classifyTaskType`) |
| `src/components/QuickCommand/` | ❌ **DRIFT** | ⌘K is `src/components/CommandPalette/CommandPalette.tsx` (calls `parseCommand` at L783) |
| `src/lib/llmRouter.ts` | ✅ correctly NEW (missing as expected) | to be created at 10.5 |
| `src/lib/tabGroupStore.ts` + `TabGroupManager.tsx` | ✅ correctly NEW | to be created at 10.9/10.10 |

**3 citation drifts** — sister-shape to the v2.64.0 audit-content cluster; all three are naming drift only, the cited capabilities exist.

## 2. Spawn-surface map (empirical)

- **ARA send path** (`ARAConsole.tsx` `sendMessage`, ~L1122): `parseCommand` (One Conductor direct commands) → `matchSkill` (browser-side skills) → `sendPrompt` (LLM). **Spawn detection slots in as a third tier** between `matchSkill` and `sendPrompt` (or inside `parseCommand` as new spawn verbs — preferred, so ⌘K gets spawns for free).
- **Existing `spawnAgent(name)`** in dwelliumCommands.ts (L132) only opens a widget via alias — it does NOT run the orchestrator. A1 supersedes it with real `runTeam`/`runPersona` routing.
- **Orchestrator reuse:** `AgentLab.tsx` L85/L113 shows the exact call shape (`runTeam({goal, team, personas, deps, onEvent, onMemberTask})`); deps bundle is constructable from `integrations.llm` already in ARAConsole scope.
- **Built-in teams:** `personas.ts` — Research Squad (L243), Deal Desk (L251), Build Team (L259); state via `agentTeamsStore` (`withSync` One Save wrapped, per-user via `agentLabUserIdHolder`).
- **Team-run UI in chat:** `RunEvent`/`MemberTaskEvent` callbacks already stream phases (`decompose|execute|verify|merge`) — render as a progressive assistant message block in ARA chat.

## 3. 10.2 implementation sketch (next task)

1. `dwelliumCommands.ts`: spawn patterns → `ParsedCommand` variants carrying a `spawnRequest` (team-by-name, solo-persona, fallback open-Agent-Lab). Patterns: "spawn/run <team>", "solo <persona> on <goal>", "<team> analysis of <goal>".
2. `ARAConsole.tsx`: handle spawnRequest — call `runTeam`/`runPersona` with deps from `integrations.llm`; stream `RunEvent`s into a TeamRunMessage chat component.
3. Vitest: spawn-pattern parsing + mock-orchestrator run rendering (mock LLM per Verification Strategy; `agentTeamsStore.reset()` in beforeEach per v2.72.1).

## 4. Risks carried forward

- Team-run UI vs chat layout clash (plan risk #4) — prototype progressive-block rendering at 10.2 before polishing.
- `deps` shape in AgentLab includes skill execution wiring; ARA spawn must match or team members lose skills (ties to BACKLOG "orchestrator runs don't EXECUTE skills" — candidate to fix in the same pass at 10.2).

**Vitest delta:** +0 (scoping only). **Chunk axis:** untouched.
