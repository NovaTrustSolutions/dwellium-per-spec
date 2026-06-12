# P11-15 — Option β Structural Migration: Attempt Findings + Staged Plan

**Date:** 2026-06-12 · **Gate (Ilya):** attempt, bail if it destabilizes
**Outcome:** **BEACHHEAD SHIPPED + FULL CUTOVER STAGED (bail invoked per gate)**

## 1. What the attempt measured (empirical, this session)

| Coupling axis | Count | Where |
|---|---:|---|
| `regionAssignments` touchpoints | 14 | LayoutContext, Desktop, Window |
| `assignWindowToRegion` call sites | 14 | same 3 files |
| `regionRect`/`getRegionRects` uses | 30 | same 3 files |
| e2e specs with region semantics | **0** | — (good: no spec rewrites) |
| Files carrying ALL region coupling | **3** | `LayoutContext.tsx`, `Desktop.tsx`, `Window.tsx` |

Better than the Phase-10 plan feared (it assumed UserContext refactor too — not needed). BUT: the 3 files are the desktop's most entangled (~700 lines of Desktop render the region overlays/tab bars/drag/tear-off; Window.tsx's position override and tear-off math read regionRect directly), and the screenshot baselines capture rendered window layout — a renderer swap forces a Linux baseline recapture cycle.

## 2. What shipped (the beachhead — real Option β structure, zero behavior change)

- `WindowState.groupId?: string | null` — group membership IN the window model, the structural key the group-based desktop migrates onto. Rides saved-layout + One Save serialization for free (it's part of WindowState).
- Option α's `tabGroupStore` (P10) + drag-to-group + per-region targeting (P11-1/2) remain the USER-FACING grouping layer and are forward-compatible: a group's `componentIds` map 1:1 onto member windows' future `groupId`.

## 3. Why the full cutover bails THIS session (per the agreed gate)

1. **Renderer swap = baseline churn**: replacing region overlays/tab bars with floating group containers shifts rendered pixels → 8 screenshot baselines invalidated → Linux recapture workflow + manual side-branch merge (known repo friction) — not a same-session tail risk worth taking after 14 green clusters.
2. **Tear-off + drag math**: Window.tsx's tear-off progress/threshold logic is written against regionRect geometry; porting it to dynamic group bounds is the riskiest single piece (the 2026-06-09 tear-off arc took a day on its own).
3. **No user-visible payoff delta today**: Option α already gives create/name/open/drag-to-group/region-target. β's payoff (free-floating group windows, multi-group drag) is Phase-12-sized.

## 4. Staged cutover plan (when picked up)

1. **Stage A (done):** `groupId` in the model + serialization.
2. **Stage B:** WindowContext `assignWindowToGroup` + group-derived selectors; TabGroupManager "open as floating group" writes `groupId` on member windows (dual-write with regionAssignments).
3. **Stage C:** GroupContainer component (one draggable frame, member tabs inside, group-level drag/resize) rendered for grouped windows; regions keep rendering ungrouped ones (coexistence — no flag-day).
4. **Stage D:** port tear-off to group bounds; migrate spaces/conductor buses to emit groups; delete region overlays; recapture Linux baselines (planned, not incidental).
5. **Stage E:** remove `regionAssignments` (the 14+14 touchpoints), collapse LayoutContext.

Each stage gates green independently; C is the first visible change and the natural Phase-12 opener.
