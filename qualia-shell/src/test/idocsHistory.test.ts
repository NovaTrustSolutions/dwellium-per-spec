/**
 * Interactive Docs — pure history ring buffer: dedupe, cap, undo/redo/restore,
 * byte cap, persisted-payload normalization, and the debouncer via an injected
 * scheduler (real timers only — nothing here touches setTimeout).
 */
import { describe, it, expect } from 'vitest';
import {
    pushSnapshot, undo, redo, restoreSnapshot, canUndo, canRedo, capHistoryBytes, normalizeHistory,
    createSnapshotDebouncer, relativeTime, sameDoc, emptyHistory, HISTORY_MAX,
} from '../components/Scribe/idocs/idocsHistory';
import { createEmptyDoc, type IDoc } from '../components/Scribe/idocs/idocTypes';

const base = createEmptyDoc({ id: 'd1' }); // fixed card/block ids so "same title" ⇒ same doc
const doc = (title: string, extra: Partial<IDoc> = {}): IDoc => ({ ...base, title, ...extra });
const isDoc = (d: unknown): d is IDoc => !!d && typeof (d as IDoc).id === 'string' && Array.isArray((d as IDoc).cards);

describe('idocsHistory', () => {
    it('pushSnapshot clones, dedupes identical (ignoring updatedAt) and caps at HISTORY_MAX', () => {
        const a = doc('A');
        let h = pushSnapshot(undefined, a, 1);
        expect(h.snapshots).toHaveLength(1);
        expect(h.cursor).toBe(0);
        expect(h.snapshots[0].doc).not.toBe(a); // structural clone
        expect(pushSnapshot(h, { ...a, updatedAt: 'later' }, 2)).toBe(h); // identical → same object back
        for (let i = 0; i < 40; i++) h = pushSnapshot(h, doc(`T${i}`), 10 + i);
        expect(h.snapshots).toHaveLength(HISTORY_MAX);
        expect(h.cursor).toBe(HISTORY_MAX - 1);
        expect(h.snapshots[0].doc.title).toBe(`T${40 - HISTORY_MAX}`); // oldest dropped
    });

    it('undo flushes pending edits first, redo walks forward, a new push truncates the redo tail', () => {
        let h = pushSnapshot(undefined, doc('A'), 1);
        expect(canUndo(h)).toBe(false);
        expect(undo(h, doc('A'), 2)).toBeNull();
        // pending (unsnapshotted) edit "B" → undo pushes it, then steps back to A
        const u = undo(h, doc('B'), 3)!;
        expect(u.doc.title).toBe('A');
        expect(u.history.snapshots.map((s) => s.doc.title)).toEqual(['A', 'B']);
        expect(u.history.cursor).toBe(0);
        h = u.history;
        expect(canRedo(h)).toBe(true);
        const r = redo(h)!;
        expect(r.doc.title).toBe('B');
        expect(r.history.cursor).toBe(1);
        expect(redo(r.history)).toBeNull();
        // back at A, push C → B is gone
        h = pushSnapshot(u.history, doc('C'), 4);
        expect(h.snapshots.map((s) => s.doc.title)).toEqual(['A', 'C']);
        expect(restoreSnapshot(h, 0)!.doc.title).toBe('A');
        expect(restoreSnapshot(h, 5)).toBeNull();
        expect(restoreSnapshot(undefined, 0)).toBeNull();
    });

    it('capHistoryBytes drops the oldest snapshots across docs but never the cursor/last one', () => {
        const big = (t: string) => doc(t, { description: 'x'.repeat(2000) });
        let h1 = emptyHistory(); let h2 = emptyHistory();
        for (let i = 0; i < 5; i++) { h1 = pushSnapshot(h1, big(`a${i}`), i); h2 = pushSnapshot(h2, big(`b${i}`), 100 + i); }
        const before = JSON.stringify({ h1, h2 }).length;
        const capped = capHistoryBytes({ h1, h2 }, Math.floor(before / 2));
        expect(JSON.stringify(capped).length).toBeLessThanOrEqual(Math.floor(before / 2));
        // h1 is older → trimmed first; cursor still points at its last snapshot
        expect(capped.h1.snapshots.length).toBeLessThan(5);
        expect(capped.h1.cursor).toBe(capped.h1.snapshots.length - 1);
        expect(capped.h1.snapshots[capped.h1.cursor].doc.title).toBe('a4');
        expect(capped.h2.snapshots[capped.h2.cursor].doc.title).toBe('b4');
        // under budget → same object
        const small = { h: pushSnapshot(undefined, doc('s'), 1) };
        expect(capHistoryBytes(small, 10_000)).toBe(small);
    });

    it('normalizeHistory tolerates missing/garbage payloads and clamps the cursor', () => {
        expect(normalizeHistory(undefined, isDoc)).toEqual({});
        expect(normalizeHistory('nope', isDoc)).toEqual({});
        const raw = { d1: { snapshots: [{ at: 1, doc: doc('A') }, { at: 'x', doc: doc('B') }, { at: 3, doc: { id: 'no' } }], cursor: 9 }, d2: { snapshots: [] }, d3: null };
        const n = normalizeHistory(raw, isDoc);
        expect(Object.keys(n)).toEqual(['d1']);
        expect(n.d1.snapshots).toHaveLength(1);
        expect(n.d1.cursor).toBe(0);
    });

    it('createSnapshotDebouncer coalesces touches (injected scheduler) and flush/cancel behave', () => {
        const fired: Array<() => void> = []; const cancelled: number[] = [];
        const schedule = (fn: () => void, ms: number) => { expect(ms).toBe(800); const i = fired.push(fn) - 1; return () => { cancelled.push(i); }; };
        let pushes = 0;
        const d = createSnapshotDebouncer(() => { pushes++; }, { schedule });
        d.touch(); d.touch(); d.touch();
        expect(fired).toHaveLength(3);
        expect(cancelled).toEqual([0, 1]); // earlier timers cancelled → trailing only
        expect(d.pending).toBe(true);
        fired[2]();
        expect(pushes).toBe(1);
        expect(d.pending).toBe(false);
        d.flush(); // nothing pending → no push
        expect(pushes).toBe(1);
        d.touch(); d.flush();
        expect(pushes).toBe(2);
        d.touch(); d.cancel();
        expect(d.pending).toBe(false);
        expect(pushes).toBe(2);
    });

    it('sameDoc + relativeTime helpers', () => {
        expect(sameDoc(doc('A'), { ...doc('A'), updatedAt: 'z' })).toBe(true);
        expect(sameDoc(doc('A'), doc('B'))).toBe(false);
        expect(sameDoc(undefined, doc('A'))).toBe(false);
        const now = 1_000_000_000;
        expect(relativeTime(now - 10_000, now)).toBe('just now');
        expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago');
        expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
        expect(relativeTime(now - 3 * 86_400_000, now)).toMatch(/\d/);
    });
});
