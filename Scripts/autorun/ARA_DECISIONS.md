# ARA_DECISIONS.md — autonomous fork decisions (ARA/Stella/InboxZero linkage arc)

Reversible defaults logged at each fork. Branch: `feat/ara-stella-inbox-linkage`.

---

## Iteration 1 — Cycle 1 (linkage audit)

- **D1. Branch base.** Branched off `feat/workspace-widget` @ `15a2c4b` per the arc prompt (builds on the finished Workspace widget). Reversible: rebase later if needed.
- **D2. Canonical handoff bus.** For all new "open in <widget>" handoffs in Cycles 3/5/7, use the **NEW `dwellium:open-widget`** bus via `workspaceScribe.ts::dispatchOpenWidget`, not the older `qualia-open-widget`. Rationale: it's the current intent bus (WindowContext.tsx:447), already used by Workspace + Stella, and has an injectable-deps unit-test pattern. Reversible: both buses coexist.
- **D3. ARA "two surfaces" scope.** ARAConsole (full widget) and Scribe/AraMiniPanel (embedded) are treated as distinct. Cycle 3 wires the **ARAConsole** widget; AraMiniPanel's existing `scribe:send-to-ara` linkage is left intact.
- **D4. Stella protection boundary.** Stella cycles (4,5) are strictly additive/fix-only: bug fixes, resilience, and additive event dispatch. No CSS/structural/JSX-layout redesign. If a "fix" would require restructuring, log it as an open item for Ilya instead.
- **D5. Test pattern.** New linkage tests mirror `src/test/Workspace.scribe.test.ts` (dispatch helper + injectable deps + event-bus assertions) to stay deterministic under jsdom + React 19 (avoid `vi.useFakeTimers` per repo convention).
