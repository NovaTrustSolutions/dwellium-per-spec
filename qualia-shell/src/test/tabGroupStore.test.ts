/**
 * tabGroupStore — Phase-10 Task 10.9 (C1): Option α tab-group model. CRUD,
 * per-user key isolation, deserialize validation, reorder semantics,
 * last-tab-deletes-group, and the apply-space materialization bus.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    tabGroupStore,
    tabGroupsUserIdHolder,
    createGroup,
    renameGroup,
    deleteGroup,
    setGroupTabs,
    addTabToGroup,
    removeTabFromGroup,
    reorderTab,
    applyGroup,
} from '../lib/tabGroupStore';

beforeEach(() => {
    tabGroupsUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    (tabGroupStore as unknown as { reset?: () => void }).reset?.();
});

describe('CRUD', () => {
    it('creates a group with deduped tabs and defaults', () => {
        const g = createGroup('  Research  ', ['scribe', 'notepad', 'scribe']);
        expect(g.title).toBe('Research');
        expect(g.componentIds).toEqual(['scribe', 'notepad']);
        expect(g.layout).toBe('tabs');
        expect(tabGroupStore.getSnapshot()).toHaveLength(1);
    });

    it('renames (blank rename keeps the old title) and deletes', () => {
        const g = createGroup('A', ['scribe']);
        renameGroup(g.id, 'Morning Stack');
        expect(tabGroupStore.getSnapshot()[0].title).toBe('Morning Stack');
        renameGroup(g.id, '   ');
        expect(tabGroupStore.getSnapshot()[0].title).toBe('Morning Stack');
        deleteGroup(g.id);
        expect(tabGroupStore.getSnapshot()).toHaveLength(0);
    });

    it('add/remove tabs; removing the LAST tab deletes the group', () => {
        const g = createGroup('A', ['scribe']);
        addTabToGroup(g.id, 'notepad');
        addTabToGroup(g.id, 'notepad'); // dedupe no-op
        expect(tabGroupStore.getSnapshot()[0].componentIds).toEqual(['scribe', 'notepad']);
        removeTabFromGroup(g.id, 'scribe');
        removeTabFromGroup(g.id, 'notepad');
        expect(tabGroupStore.getSnapshot()).toHaveLength(0);
    });

    it('reorders tabs and ignores out-of-range moves', () => {
        const g = createGroup('A', ['a', 'b', 'c']);
        reorderTab(g.id, 0, 2);
        expect(tabGroupStore.getSnapshot()[0].componentIds).toEqual(['b', 'c', 'a']);
        reorderTab(g.id, 5, 0); // out of range — no-op
        expect(tabGroupStore.getSnapshot()[0].componentIds).toEqual(['b', 'c', 'a']);
    });
});

describe('per-user isolation + persistence shape', () => {
    it('Andy and Lisa see different groups (dynamic key)', () => {
        tabGroupsUserIdHolder.current = 'andy';
        createGroup('Andy stack', ['scribe']);
        expect(tabGroupStore.getSnapshot()).toHaveLength(1);
        tabGroupsUserIdHolder.current = 'lisa';
        expect(tabGroupStore.getSnapshot()).toHaveLength(0);
        tabGroupsUserIdHolder.current = 'andy';
        expect(tabGroupStore.getSnapshot()).toHaveLength(1);
    });

    it('round-trips through localStorage and survives garbage', () => {
        const g = createGroup('Persist me', ['scribe', 'inbox']);
        const raw = localStorage.getItem('tabgroups:test-user');
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!);
        expect(parsed[0].id).toBe(g.id);
        // garbage rows are filtered on deserialize
        localStorage.setItem('tabgroups:test-user', JSON.stringify([parsed[0], { nope: true }, 42]));
        (tabGroupStore as unknown as { reset?: () => void }).reset?.();
        expect(tabGroupStore.getSnapshot()).toHaveLength(1);
        expect(tabGroupStore.getSnapshot()[0].title).toBe('Persist me');
    });
});

describe('applyGroup materialization (Option α bus)', () => {
    it('dispatches the existing apply-space tabbed event with the tab set', () => {
        const handler = vi.fn();
        window.addEventListener('dwellium:apply-space', handler);
        try {
            const g = createGroup('Stack', ['scribe', 'notepad']);
            applyGroup(g);
        } finally {
            window.removeEventListener('dwellium:apply-space', handler);
        }
        expect(handler).toHaveBeenCalledTimes(1);
        expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
            widgets: ['scribe', 'notepad'], mode: 'tabbed',
        });
    });

    it('P11-1: optional regionId rides the event for per-region targeting', () => {
        const handler = vi.fn();
        window.addEventListener('dwellium:apply-space', handler);
        try {
            const g = createGroup('Targeted', ['scribe']);
            applyGroup(g, 'tr');
        } finally {
            window.removeEventListener('dwellium:apply-space', handler);
        }
        expect((handler.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ mode: 'tabbed', regionId: 'tr' });
    });

    it('empty groups are a no-op', () => {
        const handler = vi.fn();
        window.addEventListener('dwellium:apply-space', handler);
        try {
            applyGroup({ id: 'x', title: 'Empty', componentIds: [], layout: 'tabs', createdAt: '', updatedAt: '' });
        } finally {
            window.removeEventListener('dwellium:apply-space', handler);
        }
        expect(handler).not.toHaveBeenCalled();
    });
});
