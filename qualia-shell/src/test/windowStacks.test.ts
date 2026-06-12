/**
 * P13-1 — browser-tab navigation (Ilya 2026-06-12): "open over the active
 * widget → old one moves down one tab; drag to rearrange; closing the open
 * tab reveals the one behind it."
 */
import { describe, it, expect } from 'vitest';
import {
    detectNewWindows,
    chooseStackTarget,
    activateInGroup,
    removeFromGroup,
    reorderGroup,
    frameFromDonor,
    GROUP_TAB_BAR_H,
} from '../lib/windowStacks';
import type { WindowState } from '../data/types';

const win = (id: string, z: number, extra: Partial<WindowState> = {}): WindowState => ({
    id, title: id, icon: '', x: 100, y: 100, width: 800, height: 600,
    zIndex: z, minimized: false, maximized: false, component: id, ...extra,
});

describe('detectNewWindows', () => {
    it('finds only the freshly-opened ids', () => {
        expect(detectNewWindows(['a'], [win('a', 1), win('b', 2)])).toEqual(['b']);
        expect(detectNewWindows(['a', 'b'], [win('a', 1)])).toEqual([]);
    });
});

describe('chooseStackTarget — "no matter where the grid is, whatever the size is"', () => {
    it('no other window → none (default placement)', () => {
        expect(chooseStackTarget([win('new', 5)], {}, 'new').kind).toBe('none');
    });

    it('focused window in a region → join that region', () => {
        const t = chooseStackTarget([win('a', 1), win('b', 9), win('new', 10)], { 'region-1': ['b'] }, 'new');
        expect(t).toEqual({ kind: 'region', regionId: 'region-1', focusedId: 'b' });
    });

    it('focused FREE window (any size, even maximized) → free group with it', () => {
        const t = chooseStackTarget([win('a', 1), win('b', 9, { maximized: true }), win('new', 10)], {}, 'new');
        expect(t).toEqual({ kind: 'group', focusedId: 'b' });
    });

    it('minimized windows never count as the focused target', () => {
        const t = chooseStackTarget([win('a', 9, { minimized: true }), win('b', 2), win('new', 10)], {}, 'new');
        expect(t).toEqual({ kind: 'group', focusedId: 'b' });
    });
});

describe('group order (index 0 = visible tab)', () => {
    it('opening stacks the old tab behind the new one', () => {
        expect(activateInGroup(['old'], 'new')).toEqual(['new', 'old']);
    });

    it('closing the visible tab reveals the one behind it', () => {
        expect(removeFromGroup(['front', 'behind', 'third'], 'front')).toEqual(['behind', 'third']);
    });

    it('drag-reorder inserts before/after the target', () => {
        expect(reorderGroup(['a', 'b', 'c'], 'c', 'a', false)).toEqual(['c', 'a', 'b']);
        expect(reorderGroup(['a', 'b', 'c'], 'a', 'c', true)).toEqual(['b', 'c', 'a']);
        expect(reorderGroup(['a', 'b'], 'a', 'a', true)).toEqual(['a', 'b']); // self-drop no-op
    });
});

describe('frameFromDonor', () => {
    it('copies a free donor frame (tab bar clearance enforced)', () => {
        expect(frameFromDonor({ x: 40, y: 10, width: 700, height: 500, maximized: false }, { w: 1920, h: 1080 }))
            .toEqual({ x: 40, y: GROUP_TAB_BAR_H, width: 700, height: 500 });
    });

    it('maximized donor → desktop-filling frame below the tab bar', () => {
        const f = frameFromDonor({ x: 0, y: 0, width: 10, height: 10, maximized: true }, { w: 1920, h: 1080 });
        expect(f).toEqual({ x: 0, y: GROUP_TAB_BAR_H, width: 1920, height: 1080 - GROUP_TAB_BAR_H });
    });
});
