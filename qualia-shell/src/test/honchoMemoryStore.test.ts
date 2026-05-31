/**
 * Cycle 4 — Honcho local-first memory store (per-user, offline-persistent).
 *
 * Covers the wiring that makes "+ Add Memory" actually persist + show when the
 * backend `/api/honcho/memories` route is offline/404 (which it is in the
 * current Express backend): addLocalMemory / deleteLocalMemory / clear, the
 * per-user dynamic key, and localStorage persistence.
 *
 * Per v2.72.1, the factory store is .reset() in beforeEach. Real clock.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    memoryStore,
    memoryUserIdHolder,
    addLocalMemory,
    deleteLocalMemory,
    clearLocalMemories,
} from '../components/HonchoHermesPanel/honchoMemoryStore';

beforeEach(() => {
    localStorage.clear();
    memoryStore.reset();
    memoryUserIdHolder.current = null;
});

describe('honchoMemoryStore', () => {
    it('adds a memory that shows in the snapshot, newest first', () => {
        addLocalMemory({ userId: 'andy', content: 'first', memoryType: 'fact', importance: 0.5 });
        addLocalMemory({ userId: 'andy', content: 'second', memoryType: 'insight', importance: 0.8 });
        const snap = memoryStore.getSnapshot();
        expect(snap.length).toBe(2);
        expect(snap[0].content).toBe('second'); // newest first
        expect(snap[1].content).toBe('first');
    });

    it('persists to localStorage under the per-user key', () => {
        memoryUserIdHolder.current = 'andy';
        addLocalMemory({ userId: 'andy', content: 'remember the gate code', memoryType: 'fact', importance: 0.6 });
        const raw = localStorage.getItem('honcho:memories:andy');
        expect(raw).toBeTruthy();
        expect(raw).toContain('remember the gate code');
    });

    it('returns a fully-shaped memory (id, source, timestamps, metadata)', () => {
        const m = addLocalMemory({ userId: 'andy', content: 'x', memoryType: 'preference', importance: 0.3 });
        expect(m.id).toMatch(/^mem-/);
        expect(m.source).toBe('manual');
        expect(typeof m.createdAt).toBe('string');
        expect(typeof m.updatedAt).toBe('string');
        expect(m.metadata).toEqual({});
    });

    it('deletes a memory by id and reports whether it existed', () => {
        const m = addLocalMemory({ userId: 'andy', content: 'temp', memoryType: 'fact', importance: 0.5 });
        expect(deleteLocalMemory(m.id)).toBe(true);
        expect(memoryStore.getSnapshot().length).toBe(0);
        expect(deleteLocalMemory('mem-nonexistent')).toBe(false);
    });

    it('scopes memories per-user via the dynamic key holder', () => {
        memoryUserIdHolder.current = 'andy';
        addLocalMemory({ userId: 'andy', content: 'andy-only', memoryType: 'fact', importance: 0.5 });
        memoryUserIdHolder.current = 'lisa';
        // Lisa sees none of Andy's memories.
        expect(memoryStore.getSnapshot().length).toBe(0);
        addLocalMemory({ userId: 'lisa', content: 'lisa-only', memoryType: 'fact', importance: 0.5 });
        expect(memoryStore.getSnapshot().map(m => m.content)).toEqual(['lisa-only']);
        memoryUserIdHolder.current = 'andy';
        expect(memoryStore.getSnapshot().map(m => m.content)).toEqual(['andy-only']);
    });

    it('clears all memories for the active user', () => {
        memoryUserIdHolder.current = 'andy';
        addLocalMemory({ userId: 'andy', content: 'a', memoryType: 'fact', importance: 0.5 });
        addLocalMemory({ userId: 'andy', content: 'b', memoryType: 'fact', importance: 0.5 });
        clearLocalMemories();
        expect(memoryStore.getSnapshot().length).toBe(0);
        expect(localStorage.getItem('honcho:memories:andy')).toBeNull();
    });
});
