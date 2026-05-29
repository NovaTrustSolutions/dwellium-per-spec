# ARA_DECISIONS.md — autonomous fork decisions (ARA/Stella/InboxZero linkage arc)

Reversible defaults logged at each fork. Branch: `feat/ara-stella-inbox-linkage`.

---

## Iteration 1 — Cycle 1 (linkage audit)

- **D1. Branch base.** Branched off `feat/workspace-widget` @ `15a2c4b` per the arc prompt (builds on the finished Workspace widget). Reversible: rebase later if needed.
- **D2. Canonical handoff bus.** For all new "open in <widget>" handoffs in Cycles 3/5/7, use the **NEW `dwellium:open-widget`** bus via `workspaceScribe.ts::dispatchOpenWidget`, not the older `qualia-open-widget`. Rationale: it's the current intent bus (WindowContext.tsx:447), already used by Workspace + Stella, and has an injectable-deps unit-test pattern. Reversible: both buses coexist.
- **D3. ARA "two surfaces" scope.** ARAConsole (full widget) and Scribe/AraMiniPanel (embedded) are treated as distinct. Cycle 3 wires the **ARAConsole** widget; AraMiniPanel's existing `scribe:send-to-ara` linkage is left intact.
- **D4. Stella protection boundary.** Stella cycles (4,5) are strictly additive/fix-only: bug fixes, resilience, and additive event dispatch. No CSS/structural/JSX-layout redesign. If a "fix" would require restructuring, log it as an open item for Ilya instead.
- **D5. Test pattern.** New linkage tests mirror `src/test/Workspace.scribe.test.ts` (dispatch helper + injectable deps + event-bus assertions) to stay deterministic under jsdom + React 19 (avoid `vi.useFakeTimers` per repo convention).

## Iteration 3 — Cycle 3 (ARA linkage)

- **D6. Inbox handoff target = `inbox`, not `inbox-zero`.** widgetRegistry.ts marks
  `inbox-zero` @deprecated (label "Inbox Zero (deprecated)"); the LIVE entry is `inbox`
  (label "Inbox Zero"), both pointing at the same InboxZero component. ARA's "open inbox"
  handoff targets the non-deprecated `inbox`. Reversible: single catalog edit in araLinkage.ts.
- **D7. Handoff suggestion = keyword scan of latest reply, not LLM intent.** Deterministic,
  unit-testable, zero extra backend calls. Word-boundary matching avoids substring false
  positives (e.g. "scribed" ≠ "scribe"); capped at 3 chips to avoid a wall of buttons.
  Reversible: catalog + MAX_HANDOFFS are data, not logic.
- **D8. A3 reuses AraMiniPanel's exact `scribe:send-to-ara` contract.** Both ARA surfaces
  now answer a selection handoff; no new event name invented. composeAraPrompt is byte-for-byte
  the same preface+blockquote shape as AraMiniPanel.tsx.
