import { describe, it, expect, beforeEach } from 'vitest';
import { recall, remember, memoryCounts } from '../lib/unifiedMemory';
import { memoryStore, memoryUserIdHolder } from '../components/HonchoHermesPanel/honchoMemoryStore';
import { copawStore, copawUserIdHolder, captureFacts } from '../components/Hive/copawStore';
import { thoughtWeaverStore } from '../components/ThoughtWeaver/thoughtWeaverStore';

beforeEach(() => {
    memoryStore.reset();
    copawStore.reset();
    thoughtWeaverStore.reset();
    localStorage.clear();
    memoryUserIdHolder.current = 'test-user';
});

describe('unifiedMemory (One Memory)', () => {
    it('remember writes to honcho and recall finds it', () => {
        remember('the boiler at PGA Plaza needs servicing');
        const hits = recall('boiler');
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].text).toMatch(/boiler/i);
        expect(hits[0].source).toBe('honcho');
    });

    it('counts reflect what was written', () => {
        remember('alpha');
        remember('beta');
        expect(memoryCounts().honcho).toBeGreaterThanOrEqual(2);
        expect(memoryCounts().total).toBeGreaterThanOrEqual(2);
    });

    it('token-overlap matching (not just substring)', () => {
        remember('quarterly maintenance schedule for the elevator');
        const hits = recall('elevator maintenance');
        expect(hits.some(h => /elevator/i.test(h.text))).toBe(true);
    });

    it('empty query returns recent memories', () => {
        remember('something');
        expect(recall('').length).toBeGreaterThan(0);
    });

    it('surfaces a captured copaw fact via recall() with source copaw', () => {
        copawUserIdHolder.current = 'test-user';
        captureFacts('copaw', 'The elevator maintenance contract renews every March for this building.', 'test-user');
        const hits = recall('elevator maintenance contract');
        expect(hits.some((h) => h.source === 'copaw' && /elevator maintenance contract/i.test(h.text))).toBe(true);
    });

    it('does not surface a sensitive copaw fact even when written directly to the store', () => {
        copawUserIdHolder.current = 'test-user';
        copawStore.set([
            { id: 'x1', text: 'The vendor portal password is Summer2026! for all staff.', source: 'copaw', createdAt: new Date().toISOString() },
        ], () => { /* no-op: skip localStorage persistence for this in-memory test */ });
        const hits = recall('vendor portal password');
        expect(hits.length).toBe(0);
    });
});
