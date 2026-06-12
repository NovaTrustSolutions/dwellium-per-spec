# Phase-10 Task 10.9 — C1: Tab-Group Data Model + One Save (Option α)

**Date:** 2026-06-11
**Gate (locked at kickoff):** Option α incremental — groups as a UI layer over the 5-region model; structural migration deferred to Phase-11.

## What shipped

1. **`src/lib/tabGroupStore.ts` (NEW).** `TabGroup { id, title, componentIds[], layout:'tabs', createdAt, updatedAt }` — a named, ordered widget set that materializes as a browser-style tab stack in one region via the EXISTING `dwellium:apply-space {mode:'tabbed'}` bus (`applyGroup`); the region/window model is untouched per Option α. Distinct from Spaces: a Space is the whole canvas, a group is one named stack, several can coexist. `layout` reserved for Phase-11 split modes.
2. **Persistence.** Per-user dynamic-key factory (`tabgroups:<userId>` via `tabGroupsUserIdHolder`) + One Save `withSync` (objectType `tab-groups`) — exact agentTeamsStore/savedLayoutsStore sister shape incl. the v2.72.1 `.reset()` convention. Deserialize filters garbage rows. SSR-safe by construction.
3. **Mutators + hook.** create (dedupe + trim) / rename (blank-safe) / delete / setGroupTabs (last-tab-removal deletes the group) / addTab / removeTab / reorderTab (range-guarded) / `useTabGroups()` (useSyncExternalStore + holder-set-during-render, AgentLab pattern).
4. **`src/test/tabGroupStore.test.ts` (NEW).** 8 tests: CRUD + dedupe + blank-rename, last-tab-deletes-group, reorder + range guards, Andy≠Lisa key isolation, localStorage round-trip + garbage filtering, apply-space bus dispatch + empty-group no-op.

## Verification

| Stage | Result |
|---|---|
| `tsc -b` | exit 0 |
| vitest full (Mac) | **137 files / 1187 tests PASS** (+8) |
| builds seeds=true/false | OK / OK |
| PII | 51 files, 0 leaks |
| SSR smoke (`SMOKE_TEST_PORT=3210`) | **PASS** |

## Honest scope notes

- Plan success criterion "no loss of open-windows state across reload" is carried by the established synced-store machinery (same as savedLayouts) — not separately re-proven here; the group SET round-trip is tested.
- `applyGroup` stacks into the first region (existing bus behavior); region-targeted placement is a 10.10 affordance candidate.
- No UI yet — 10.10 builds TabGroupManager on this model.

**Vitest delta:** +8 (1179 → 1187). **Files:** 1 new production, 1 new test.
