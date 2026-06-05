/**
 * Global active-thread store (spec §4.3, Thread switcher) — per-user persistence.
 * Factory store is .reset() in beforeEach per the v2.72.1 standing convention.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { activeThreadStore, activeThreadUserIdHolder, setActiveThread } from '../components/Workspace/activeThreadStore';

beforeEach(() => {
    localStorage.clear();
    activeThreadStore.reset();
    activeThreadUserIdHolder.current = null;
});

describe('activeThreadStore', () => {
    it('defaults to null (no active thread) and is SSR-safe', () => {
        expect(activeThreadStore.getSnapshot()).toBeNull();
        expect(activeThreadStore.getServerSnapshot()).toBeNull();
    });

    it('sets and reads the active thread', () => {
        setActiveThread({ path: 'Acme/Renovation/Permits', name: 'Permits', tier: 'thread' });
        expect(activeThreadStore.getSnapshot()).toEqual({ path: 'Acme/Renovation/Permits', name: 'Permits', tier: 'thread' });
    });

    it('clears with null', () => {
        setActiveThread({ path: 'A', name: 'A', tier: 'thread' });
        setActiveThread(null);
        expect(activeThreadStore.getSnapshot()).toBeNull();
    });

    it('persists per user and survives reset + reread', () => {
        activeThreadUserIdHolder.current = 'andy';
        setActiveThread({ path: 'Acme/Permits', name: 'Permits', tier: 'thread' });
        expect(localStorage.getItem('dwellium:active-thread:andy')).toBeTruthy();
        activeThreadStore.reset();
        expect(activeThreadStore.getSnapshot()?.name).toBe('Permits');
    });

    it('isolates per user', () => {
        activeThreadUserIdHolder.current = 'andy';
        setActiveThread({ path: 'A', name: 'Andy thread', tier: 'thread' });
        activeThreadUserIdHolder.current = 'lisa';
        activeThreadStore.reset();
        expect(activeThreadStore.getSnapshot()).toBeNull();
        activeThreadUserIdHolder.current = 'andy';
        activeThreadStore.reset();
        expect(activeThreadStore.getSnapshot()?.name).toBe('Andy thread');
    });
});
