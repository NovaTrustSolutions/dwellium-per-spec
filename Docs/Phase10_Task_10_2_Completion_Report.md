# Phase-10 Task 10.2 — A1: Spawn Team / Solo Persona from ARA

**Date:** 2026-06-11
**Gate (locked at 10.1):** Block A confirmed as planned — ARA is the single spawning point; team-run UI inside ARA chat.

## What shipped

1. **`src/lib/agents/spawn.ts` (NEW, React-free).** `parseSpawn` grammar ("spawn/assemble <target> on <goal>", "run a <target> analysis of <goal>", "solo <persona> on <goal>", "have the <persona> look into <goal>") + `resolveSpawnTarget` against the live `agentTeamsStore` catalog (built-ins + user-created; suffix-stripped aliases so "research team" hits Research Squad). Double-gated: no goal OR unresolvable target → null → falls through to existing rules/chat ("run tests on the build" stays chat). `requestSpawn`/`consumePendingSpawn` pending-slot + `dwellium:ara-spawn` event covers the ⌘K→ARA-mount race.
2. **`src/lib/dwelliumCommands.ts`.** `parseCommand` tries spawn FIRST (before compound-split, so goals containing "and" stay intact); spawn `ParsedCommand.run()` opens ARA + fires the event. Bare "spawn agents" keeps the pre-existing open-Agent-Lab rule. ⌘K inherits spawns for free.
3. **`src/components/ARAConsole/ARAConsole.tsx`.** `runSpawn` hosts the orchestrator run in chat: one progressive assistant message streams `decompose`/`execute`/`verify`/`merge` RunEvents, then the merged deliverable. Deps mirror AgentLab byte-for-byte (callLlm + Hermes `relevantPastRuns`/`recordRun` — agents learn regardless of entry door; `hermesLearningUserIdHolder` set from `user.id`). Composer path intercepts spawn imperatives before `parseCommand` (no event round-trip, no duplicate echo); event path serves ⌘K. No-LLM-key case degrades to a CTA line pointing at Control Panel → API Keys.
4. **`src/test/araSpawn.test.ts` (NEW).** 18 tests: target resolution (built-ins, customs, unknowns), grammar incl. and-in-goal + politeness, parseCommand integration + event dispatch (spied), bare-spawn regression, pending-slot one-shot semantics. `agentTeamsStore.reset()` in beforeEach per v2.72.1.

## Verification (proof inline in session)

| Stage | Result | Where run |
|---|---|---|
| `tsc -b` | exit 0 | sandbox |
| vitest full | **131 files / 1116 tests PASS** (+18 delta) | Mac |
| `react-router build` seeds=true | BUILD1_OK | Mac |
| seeds=false | BUILD2_OK | Mac |
| PII | 51 files, 0 leaks | Mac |
| SSR smoke | **PASS** — 200/6049 B, 0 console errors, 0 hydration warnings (`SMOKE_TEST_PORT=3210`) | Mac |

SSR smoke also empirically validates the new SSR-graph edge (dwelliumCommands → agentTeamsStore factory store) — zero ReferenceErrors.

**Finding (F-class candidate):** smoke-test default :3000 collides with the live backend → false FAIL (probe hit backend, 404/139 B). `SMOKE_TEST_PORT` env-override is the designed escape hatch; consider defaulting the strict-gate command to a non-backend port.

## Honest scope notes (per green-gate ≠ working)

- The parse → event → orchestrator-call path is unit-tested with mocks. The **live end-to-end run** (real LLM key, "spawn research team on X" producing a merged deliverable in ARA chat) is NOT yet verified — needs a browser session with Ilya's key. 10.2 live-check is the first item of the 10.3 session.
- Team members still do NOT execute AGENT_SKILLS during runs (pre-existing BACKLOG item; orchestrator-level change, not entry-door-level). Deliberately out of 10.2 scope.
- Plan's "side-panel fallback" deferred: openWidget('ara-console') full-widget flow only.

**Vitest delta:** +18 (1098 → 1116). **Files:** 2 new + 2 modified production, 1 new test.
