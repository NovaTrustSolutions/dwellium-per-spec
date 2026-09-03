/**
 * Unit tests for gridLockStore — the "lock grid in place" persistence.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { gridLockStore, setGridLocked, isGridLocked, GRID_LOCK_KEY } from '../utils/gridLockStore';

/** No holder set in this file → the anonymous per-user namespace (the legacy global key is read-only now). */
const KEY = `${GRID_LOCK_KEY}:_anonymous`;

describe('gridLockStore', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
        gridLockStore.reset(); // clear in-memory cache (standing convention)
    });

    it('defaults to unlocked (false)', () => {
        expect(gridLockStore.getSnapshot()).toBe(false);
        expect(isGridLocked()).toBe(false);
    });

    it('getServerSnapshot is always the SSR default (false)', () => {
        setGridLocked(true);
        expect(gridLockStore.getServerSnapshot()).toBe(false);
    });

    it('setGridLocked(true) persists + reflects in the snapshot', () => {
        setGridLocked(true);
        expect(gridLockStore.getSnapshot()).toBe(true);
        expect(isGridLocked()).toBe(true);
        expect(localStorage.getItem(KEY)).toBe('true');
    });

    it('setGridLocked(false) clears the locked state', () => {
        setGridLocked(true);
        setGridLocked(false);
        expect(gridLockStore.getSnapshot()).toBe(false);
        expect(localStorage.getItem(KEY)).toBe('false');
    });

    it('notifies subscribers on change and stops after unsubscribe', () => {
        let calls = 0;
        const unsub = gridLockStore.subscribe(() => { calls++; });
        setGridLocked(true);
        expect(calls).toBe(1);
        unsub();
        setGridLocked(false);
        expect(calls).toBe(1); // no further notifications after unsubscribe
    });

    it('reset() re-reads from storage fresh', () => {
        setGridLocked(true);
        expect(gridLockStore.getSnapshot()).toBe(true);
        localStorage.removeItem(KEY);
        gridLockStore.reset();
        expect(gridLockStore.getSnapshot()).toBe(false);
    });
});
