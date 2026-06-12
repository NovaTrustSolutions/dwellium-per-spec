# Phase-10 Task 10.10 — C2: TabGroupManager CRUD UI

**Date:** 2026-06-11

## What shipped

1. **`src/components/Shell/TabGroupManager.tsx` + `.css` (NEW).** Compact glass panel: build a group by checking currently-open windows (deduped by component) + naming the stack; saved groups list with one-click open (→ `applyGroup` → existing apply-space tabbed bus), inline rename (Enter commits / Esc cancels / blank-safe), delete, and per-tab chips with remove (last chip deletes the group, store semantics). Theme-variable driven for BL4 cohesion; every icon-only control carries an aria-label + focus-visible outline per repo a11y conventions.
2. **Desktop wiring.** "⊟ Groups" toggle appended to the existing collapsible layout-preset toolbar; panel renders over the canvas, fed `openWindows` from live window state (minimized excluded).
3. **`src/test/tabGroupManager.test.tsx` (NEW).** 6 RTL tests against the real store (no UserProvider needed — useTabGroups null-guards via useContext, repo convention): create-from-selection, disabled-empty-create, open-dispatches-bus, inline rename + delete, last-chip-deletes-group, candidate dedupe. One a11y fix surfaced by tests: rename input and rename button shared an aria-label — disambiguated.

## Verification

| Stage | Result |
|---|---|
| `tsc -b` | exit 0 |
| vitest full (Mac) | **138 files / 1193 tests PASS** (+6) |
| builds seeds=true/false | OK / OK |
| PII | 51 files, 0 leaks |
| SSR smoke (`SMOKE_TEST_PORT=3210`) | **PASS** |

## Honest scope notes

- Drag-a-tab-onto-a-group affordance NOT built (plan's own carry-forward candidate: "multi-group drag interactions" → Phase-11). The MVP CRUD surface from the plan is complete.
- `applyGroup` targets the first region (existing bus behavior); per-region targeting is a small follow-up if wanted.
- Panel placement (layout toolbar) is a judgment call — cheap to move if you want it in the sidebar gear or ⌘K instead.
- Not yet visually verified in the live browser (same standing live-pass item as the rest of the arc).

**🎯 Block C MVP complete (10.9 + 10.10).** **Vitest delta:** +6 (1187 → 1193). **Files:** 2 new + 1 modified production, 1 new test.
