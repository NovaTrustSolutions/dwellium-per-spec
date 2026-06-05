/**
 * Scribe per-document priority store (spec §5.11) — per-user local persistence.
 * Per the v2.72.1 standing convention the factory-produced store is .reset() in
 * beforeEach to prevent cross-test module-cache pollution.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    priorityStore,
    priorityUserIdHolder,
    getDocPriority,
    setDocPriority,
} from '../components/Scribe/priorityStore';

beforeEach(() => {
    localStorage.clear();
    priorityStore.reset();
    priorityUserIdHolder.current = null;
});

describe('priorityStore', () => {
    it('defaults to none for an unset file', () => {
        expect(getDocPriority(priorityStore.getSnapshot(), 'a.md')).toBe('none');
        expect(priorityStore.getServerSnapshot()).toEqual({});
    });

    it('sets and reads a priority', () => {
        setDocPriority('a.md', 'high');
        expect(getDocPriority(priorityStore.getSnapshot(), 'a.md')).toBe('high');
    });

    it("setting 'none' clears the entry", () => {
        setDocPriority('a.md', 'medium');
        expect(getDocPriority(priorityStore.getSnapshot(), 'a.md')).toBe('medium');
        setDocPriority('a.md', 'none');
        expect(getDocPriority(priorityStore.getSnapshot(), 'a.md')).toBe('none');
        expect(priorityStore.getSnapshot()['a.md']).toBeUndefined();
    });

    it('persists under the per-user key and survives reset + reread', () => {
        priorityUserIdHolder.current = 'andy';
        setDocPriority('plan.md', 'high');
        expect(localStorage.getItem('scribe:priority:andy')).toBeTruthy();
        priorityStore.reset();
        expect(getDocPriority(priorityStore.getSnapshot(), 'plan.md')).toBe('high');
    });

    it('isolates priorities per user', () => {
        priorityUserIdHolder.current = 'andy';
        setDocPriority('plan.md', 'high');
        priorityUserIdHolder.current = 'lisa';
        priorityStore.reset();
        expect(getDocPriority(priorityStore.getSnapshot(), 'plan.md')).toBe('none');
        setDocPriority('plan.md', 'low');
        expect(getDocPriority(priorityStore.getSnapshot(), 'plan.md')).toBe('low');
        priorityUserIdHolder.current = 'andy';
        priorityStore.reset();
        expect(getDocPriority(priorityStore.getSnapshot(), 'plan.md')).toBe('high');
    });

    it('ignores corrupt / unknown values on deserialize', () => {
        priorityUserIdHolder.current = 'andy';
        localStorage.setItem('scribe:priority:andy', JSON.stringify({ 'a.md': 'bogus', 'b.md': 'high' }));
        priorityStore.reset();
        const snap = priorityStore.getSnapshot();
        expect(snap['a.md']).toBeUndefined();
        expect(snap['b.md']).toBe('high');
    });
});
