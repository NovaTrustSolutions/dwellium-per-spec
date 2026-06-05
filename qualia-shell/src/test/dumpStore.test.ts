/**
 * Scribe Brain Dump store (spec §5.2) — per-user local persistence + the pure
 * numbering / compile helpers.
 *
 * Tests the store directly (no React render). Per the v2.72.1 standing
 * convention the factory-produced store is .reset() in beforeEach. Real clock —
 * timestamps are passed in explicitly so assertions stay deterministic
 * (Phase-7 Finding (B): no fake timers).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    dumpStore,
    dumpUserIdHolder,
    buildNextDump,
    appendDump,
    clearDumps,
    compileBrainDumpMarkdown,
    type DumpEntry,
} from '../components/Scribe/dumpStore';

const NOW = new Date('2026-06-04T12:00:00.000Z');

beforeEach(() => {
    localStorage.clear();
    dumpStore.reset();
    dumpUserIdHolder.current = null;
});

describe('dumpStore', () => {
    it('starts empty and getServerSnapshot is the SSR-safe default', () => {
        expect(dumpStore.getSnapshot()).toEqual([]);
        expect(dumpStore.getServerSnapshot()).toEqual([]);
    });

    it('buildNextDump numbers oldest-first (pure, no persistence)', () => {
        const a = buildNextDump([], 'first', NOW);
        expect(a.entry.promptNumber).toBe(1);
        const b = buildNextDump(a.next, 'second', NOW);
        expect(b.entry.promptNumber).toBe(2);
        expect(b.next).toHaveLength(2);
        expect(b.next[0].content).toBe('first');
        expect(b.next[1].content).toBe('second');
    });

    it('appendDump trims, increments promptNumber, and returns the entry', () => {
        const e1 = appendDump('  hello  ', NOW);
        expect(e1?.content).toBe('hello');
        expect(e1?.promptNumber).toBe(1);
        const e2 = appendDump('world', NOW);
        expect(e2?.promptNumber).toBe(2);
        expect(dumpStore.getSnapshot()).toHaveLength(2);
    });

    it('appendDump ignores empty / whitespace-only input', () => {
        expect(appendDump('', NOW)).toBeNull();
        expect(appendDump('   \n  ', NOW)).toBeNull();
        expect(dumpStore.getSnapshot()).toEqual([]);
    });

    it('persists under the per-user key and survives a reset + reread', () => {
        dumpUserIdHolder.current = 'andy';
        appendDump('andy thought', NOW);
        expect(localStorage.getItem('scribe:braindump:andy')).toBeTruthy();
        dumpStore.reset(); // simulate a fresh mount
        expect(dumpStore.getSnapshot()[0].content).toBe('andy thought');
    });

    it('isolates dumps per user', () => {
        dumpUserIdHolder.current = 'andy';
        appendDump('andy', NOW);
        dumpUserIdHolder.current = 'lisa';
        dumpStore.reset();
        expect(dumpStore.getSnapshot()).toEqual([]);
        appendDump('lisa', NOW);
        expect(dumpStore.getSnapshot()[0].content).toBe('lisa');
        dumpUserIdHolder.current = 'andy';
        dumpStore.reset();
        expect(dumpStore.getSnapshot()[0].content).toBe('andy');
    });

    it('clearDumps wipes everything for the current user', () => {
        appendDump('x', NOW);
        appendDump('y', NOW);
        clearDumps();
        expect(dumpStore.getSnapshot()).toEqual([]);
    });
});

describe('compileBrainDumpMarkdown', () => {
    it('renders # Prompt N headers in promptNumber order', () => {
        const entries: DumpEntry[] = [
            { id: '2', promptNumber: 2, timestamp: 't2', iso: NOW.toISOString(), content: 'second' },
            { id: '1', promptNumber: 1, timestamp: 't1', iso: NOW.toISOString(), content: 'first' },
        ];
        const md = compileBrainDumpMarkdown(entries, 'Brain Dump');
        expect(md.startsWith('# Brain Dump')).toBe(true);
        const p1 = md.indexOf('# Prompt 1');
        const p2 = md.indexOf('# Prompt 2');
        expect(p1).toBeGreaterThan(-1);
        expect(p2).toBeGreaterThan(p1); // ordered oldest-first
        expect(md).toContain('first');
        expect(md).toContain('second');
    });

    it('handles the empty case without throwing', () => {
        expect(compileBrainDumpMarkdown([])).toContain('No dumps yet');
    });
});
