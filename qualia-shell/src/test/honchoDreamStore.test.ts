/**
 * Cycle 8 — Honcho dream abilities (appendDream / deleteDream / clearDreams),
 * surfaced in the standalone Honcho widget's Dreams tab.
 *
 * Tests the per-user dream store directly (no React render — the panel needs a
 * UserProvider; the store is the unit under test here). Per the v2.72.1 standing
 * convention the factory-produced store is .reset() in beforeEach. Real clock
 * (Date.now / new Date) — no fake timers (Phase-7 Finding (B)).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    dreamStore,
    dreamUserIdHolder,
    appendDream,
    deleteDream,
    clearDreams,
} from '../components/StellaAgent/honchoDreamStore';

beforeEach(() => {
    localStorage.clear();
    dreamStore.reset();
    dreamUserIdHolder.current = null;
});

describe('honchoDreamStore', () => {
    it('starts empty', () => {
        expect(dreamStore.getSnapshot()).toEqual([]);
    });

    it('getServerSnapshot is the empty default (SSR-safe)', () => {
        expect(dreamStore.getServerSnapshot()).toEqual([]);
    });

    it('appendDream prepends and returns the created entry with id + createdAt', () => {
        const d = appendDream({ title: 'Pattern: Wednesdays', text: 'Meetings cluster.', sources: [] });
        expect(d.id).toMatch(/^dream-/);
        expect(typeof d.createdAt).toBe('string');
        const snap = dreamStore.getSnapshot();
        expect(snap).toHaveLength(1);
        expect(snap[0].title).toBe('Pattern: Wednesdays');
    });

    it('appendDream keeps newest first', () => {
        appendDream({ title: 'first', text: 'a', sources: [] });
        appendDream({ title: 'second', text: 'b', sources: [] });
        const snap = dreamStore.getSnapshot();
        expect(snap.map(d => d.title)).toEqual(['second', 'first']);
    });

    it('deleteDream removes only the targeted entry', () => {
        const a = appendDream({ title: 'keep', text: 'x', sources: [] });
        const b = appendDream({ title: 'drop', text: 'y', sources: [] });
        deleteDream(b.id);
        const snap = dreamStore.getSnapshot();
        expect(snap).toHaveLength(1);
        expect(snap[0].id).toBe(a.id);
    });

    it('clearDreams empties the store', () => {
        appendDream({ title: 'one', text: 'x', sources: [] });
        appendDream({ title: 'two', text: 'y', sources: [] });
        clearDreams();
        expect(dreamStore.getSnapshot()).toEqual([]);
    });

    it('isolates dreams per user via the dynamic key holder', () => {
        dreamUserIdHolder.current = 'andy';
        appendDream({ title: 'andy-dream', text: 'a', sources: [] });
        expect(dreamStore.getSnapshot().map(d => d.title)).toEqual(['andy-dream']);

        dreamUserIdHolder.current = 'lisa';
        // Different key → cache invalidates → lisa sees her own (empty) bucket.
        expect(dreamStore.getSnapshot()).toEqual([]);
        appendDream({ title: 'lisa-dream', text: 'b', sources: [] });
        expect(dreamStore.getSnapshot().map(d => d.title)).toEqual(['lisa-dream']);

        dreamUserIdHolder.current = 'andy';
        expect(dreamStore.getSnapshot().map(d => d.title)).toEqual(['andy-dream']);
    });
});
