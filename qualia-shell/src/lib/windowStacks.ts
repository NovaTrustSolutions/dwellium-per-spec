/**
 * windowStacks — P13-1 browser-tab navigation (Ilya, 2026-06-12):
 * "Whenever a widget is opened to a full screen and you click on another
 * one, it should move that widget down one tab and open up the new widget
 * full screen... no matter where the grid is, whatever the size is."
 *
 * Pure decision + group-order helpers behind Desktop's open-follows-focus
 * wiring. Two containers exist:
 *   - REGION stacks (grid): full tab behavior already shipped — opening
 *     into the focused window's region reuses it.
 *   - FREE GROUPS (this file's main client): windows sharing
 *     `WindowState.groupId` (the P11-15 Option β beachhead, activated here)
 *     render as ONE frame — index 0 of the group order is the visible tab,
 *     the rest stay mounted but hidden (state preserved, like browser tabs).
 *
 * All functions are pure → vitest covers the contract:
 * open-stacks-behind, activate, drag-reorder, close-promotes-next.
 */
import type { WindowState } from '../data/types';

export type StackTarget =
    | { kind: 'region'; regionId: string; focusedId: string }
    | { kind: 'group'; focusedId: string }
    | { kind: 'none' };

/** Ids present in `windows` but not in `prevIds` (insertion order kept). */
export function detectNewWindows(prevIds: ReadonlyArray<string>, windows: ReadonlyArray<{ id: string }>): string[] {
    const prev = new Set(prevIds);
    return windows.filter(w => !prev.has(w.id)).map(w => w.id);
}

/**
 * Where should a single newly-opened window go?
 * The focused window = highest zIndex among visible windows (excluding the
 * new one). Region if the focused window lives in one; otherwise a free
 * group with it. No focused window → default placement.
 */
export function chooseStackTarget(
    windows: ReadonlyArray<WindowState>,
    regionAssignments: Record<string, string[]>,
    newId: string,
): StackTarget {
    const candidates = windows.filter(w => w.id !== newId && !w.minimized);
    if (candidates.length === 0) return { kind: 'none' };
    const focused = candidates.reduce((a, b) => (a.zIndex >= b.zIndex ? a : b));
    for (const [regionId, ids] of Object.entries(regionAssignments)) {
        if (ids.includes(focused.id)) return { kind: 'region', regionId, focusedId: focused.id };
    }
    return { kind: 'group', focusedId: focused.id };
}

/* ─── Group order (index 0 = active/visible — region-array semantics) ─── */

/** Bring `id` to the front (adds it if absent). */
export function activateInGroup(order: ReadonlyArray<string>, id: string): string[] {
    return [id, ...order.filter(x => x !== id)];
}

/** Remove `id`; whatever lands at index 0 is the promoted tab. */
export function removeFromGroup(order: ReadonlyArray<string>, id: string): string[] {
    return order.filter(x => x !== id);
}

/**
 * Drag-reorder: insert `draggedId` before/after `targetId` (browser-tab
 * semantics — drop on the left half = before, right half = after).
 * NOTE: reordering does NOT change which tab is visible; the caller keeps
 * the active id and re-activates after reorder when the active tab moved
 * out of index 0.
 */
export function reorderGroup(
    order: ReadonlyArray<string>,
    draggedId: string,
    targetId: string,
    after: boolean,
): string[] {
    if (draggedId === targetId) return [...order];
    const without = order.filter(x => x !== draggedId);
    let idx = without.indexOf(targetId);
    if (idx < 0) return [...order];
    if (after) idx++;
    return [...without.slice(0, idx), draggedId, ...without.slice(idx)];
}

export function newGroupId(): string {
    return `wgrp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** The frame a grouped window should occupy when it becomes active. */
export interface GroupFrame { x: number; y: number; width: number; height: number }

export const GROUP_TAB_BAR_H = 28;

/**
 * Frame for a newly-activated group member, copied from the previously
 * visible member so the stack LOOKS like one window ("whatever the size
 * is"). Maximized donors translate to a desktop-filling frame below the
 * tab bar (the strip needs its 28px — a true `maximized` window would sit
 * under it).
 */
export function frameFromDonor(donor: Pick<WindowState, 'x' | 'y' | 'width' | 'height' | 'maximized'>, desktop: { w: number; h: number }): GroupFrame {
    if (donor.maximized) {
        return { x: 0, y: GROUP_TAB_BAR_H, width: desktop.w, height: Math.max(200, desktop.h - GROUP_TAB_BAR_H) };
    }
    return {
        x: donor.x,
        y: Math.max(GROUP_TAB_BAR_H, donor.y),
        width: donor.width,
        height: donor.height,
    };
}
